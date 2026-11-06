import * as path from "node:path";
import type { RecordCatalog } from "./record-types";
import { digest, identifier, loadRecordCatalog, requireCondition } from "./record-sql";
import type { HuntConnection, HuntRuntime } from "./runtime";

const definitions = [
	{ version: "1", file: "001-initial.sql" },
	{ version: "2", file: "002-verification-assessments.sql" },
] as const;
export interface SchemaDefinition {
	readonly version: string;
	readonly file: string;
	readonly sql: string;
	readonly sha256: string;
}
export interface HuntSchema {
	readonly definitions: readonly SchemaDefinition[];
}

export async function loadHuntSchema(runtime: HuntRuntime): Promise<HuntSchema> {
	const sources: SchemaDefinition[] = [];
	for (const definition of definitions) {
		const bytes = await Bun.file(path.join(runtime.schemaDirectory, definition.file)).bytes();
		const sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		requireCondition(sql.length > 0, "Empty hunt schema source");
		sources.push({ ...definition, sql, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") });
	}
	return { definitions: sources };
}

export async function databaseExists(connection: HuntConnection): Promise<boolean> {
	const rows = await connection.sql.unsafe<{ name: string }[]>(
		"SELECT SCHEMA_NAME AS name FROM information_schema.schemata WHERE SCHEMA_NAME = ?",
		[connection.database],
	);
	requireCondition(rows.length <= 1, "Ambiguous engagement database identity");
	return rows.length === 1;
}

/** Capture the installed native DDL, not merely the source digests or the record
 * catalog's column subset. The final installation marker survives metadata rollback. */
export async function initializationDescription(
	connection: HuntConnection,
	operationId: string,
	requestSha256: string,
): Promise<string> {
	const tables = await connection.sql.unsafe<{ name: string; type: string }[]>(
		"SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
	);
	const ddl: { name: string; statement: string }[] = [];
	for (const table of tables) {
		requireCondition(table.type === "BASE TABLE", "Unowned schema object during initialization");
		const rows = await connection.sql.unsafe<{ Table: string; "Create Table": string }[]>(
			`SHOW CREATE TABLE ${identifier(table.name)}`,
		);
		requireCondition(
			rows.length === 1 && rows[0]?.Table === table.name && typeof rows[0]["Create Table"] === "string",
			"Incomplete native schema definition",
		);
		ddl.push({ name: table.name, statement: rows[0]["Create Table"] });
	}
	// Approved installation contains only tables. These objects can carry
	// executable DDL without changing any approved table's SHOW CREATE output.
	for (const query of [
		"SELECT TRIGGER_NAME FROM information_schema.triggers WHERE TRIGGER_SCHEMA = DATABASE()",
		"SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = DATABASE()",
		"SELECT EVENT_NAME FROM information_schema.events WHERE EVENT_SCHEMA = DATABASE()",
	]) {
		const objects = await connection.sql.unsafe(query);
		requireCondition(objects.length === 0, "Unowned schema object during initialization");
	}
	return JSON.stringify({
		operationId,
		requestSha256,
		schemaSha256: digest({ format: "hunt-initial-schema-v1", ddl }),
	});
}

/** Only installation recovery and its initial checkpoint need this baseline:
 * later mutations compare native schema changes against their owned HEAD. */
export async function assertInitializationSchema(
	connection: HuntConnection,
	operationId: string,
	requestSha256: string,
): Promise<void> {
	const rows = await connection.sql.unsafe<{ description: string }[]>(
		"SELECT description FROM schema_versions WHERE version = ?",
		[definitions.at(-1)!.version],
	);
	requireCondition(
		rows.length === 1 &&
			rows[0]?.description === (await initializationDescription(connection, operationId, requestSha256)),
		"Installed schema or initialization intent differs; refusing adoption or checkpoint",
	);
}

export async function validateInstalledSchema(connection: HuntConnection, schema: HuntSchema): Promise<RecordCatalog> {
	const rows = await connection.sql.unsafe<{ version: string; sha256: string }[]>(
		"SELECT CAST(version AS CHAR) AS version, definition_sha256 AS sha256 FROM schema_versions ORDER BY schema_versions.version",
	);
	requireCondition(
		rows.length === schema.definitions.length &&
			rows.every(
				(row, index) =>
					row.version === schema.definitions[index]!.version && row.sha256 === schema.definitions[index]!.sha256,
			),
		"Installed schema versions/digests do not match the writer; do not adopt or replay DDL",
	);
	const catalog = await loadRecordCatalog(connection.sql);
	const verification = catalog.get("verifications");
	requireCondition(
		verification?.columns.some(column => column.name === "supersedes_verification_id") &&
			verification.columns.some(column => column.name === "supersession_rationale"),
		"Verification supersession catalog is incomplete",
	);
	for (const table of ["verification_experiments", "verification_evidence"])
		requireCondition(catalog.get(table)?.primaryKey.includes("role"), "Verification role catalog is incomplete");
	return catalog;
}

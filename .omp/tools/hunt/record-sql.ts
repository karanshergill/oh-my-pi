import type { ReservedSQL } from "bun";
import { stableStringifyJson } from "@oh-my-pi/pi-utils/json";
import type {
	CanonicalCell,
	CanonicalRow,
	ColumnMetadata,
	ForeignKeyMetadata,
	InputRow,
	InputValue,
	RecordCatalog,
	RowKey,
	TableMetadata,
} from "./record-types";

export const RECORD_TABLES = [
	"schema_versions",
	"actors",
	"runs",
	"engagements",
	"native_projects",
	"test_identities",
	"persistence_operations",
	"checkpoints",
	"checkpoint_operations",
	"evidence",
	"evidence_native_references",
	"evidence_derivations",
	"engagement_references",
	"engagement_reference_evidence",
	"research_sources",
	"research_source_evidence",
	"surfaces",
	"surface_evidence",
	"surface_research_sources",
	"target_models",
	"target_model_surfaces",
	"target_model_claims",
	"target_model_claim_evidence",
	"approach_families",
	"investigations",
	"investigation_approach_families",
	"investigation_surfaces",
	"investigation_model_claims",
	"investigation_research_sources",
	"investigation_evidence",
	"investigation_propositions",
	"investigation_proposition_evidence",
	"experiments",
	"experiment_test_identities",
	"experiment_evidence",
	"observations",
	"observation_evidence",
	"target_model_claim_observations",
	"findings",
	"finding_claim_revisions",
	"finding_investigations",
	"finding_evidence",
	"finding_claim_evidence",
	"finding_contributors",
	"verifications",
	"verification_experiments",
	"verification_evidence",
	"report_revisions",
	"report_revision_evidence",
	"report_checkpoints",
	"export_attempts",
	"caido_links",
	"sync_attempts",
	"contradictions",
	"contradiction_claims",
	"contradiction_evidence",
	"contradiction_events",
	"contradiction_event_evidence",
	"verification_contradictions",
] as const;
const tableNames = new Set<string>(RECORD_TABLES);
export class RecordError extends Error {
	constructor(
		readonly code:
			| "invalid_input"
			| "not_found"
			| "stale_revision"
			| "invariant"
			| "unavailable_checkpoint"
			| "catalog_mismatch",
		message: string,
	) {
		super(message);
		this.name = "RecordError";
	}
}
export function requireCondition(condition: unknown, message: string): asserts condition {
	if (!condition) throw new RecordError("invariant", message);
}
export function identifier(name: string): string {
	if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new RecordError("invalid_input", "Invalid SQL identifier");
	return `\`${name}\``;
}
export function tableMetadata(catalog: RecordCatalog, table: string): TableMetadata {
	const metadata = catalog.get(table);
	if (!tableNames.has(table) || !metadata || metadata.name !== table)
		throw new RecordError("catalog_mismatch", `Unavailable record table: ${table}`);
	return metadata;
}
export function columnMetadata(table: TableMetadata, column: string): ColumnMetadata {
	const result = table.columns.find(item => item.name === column);
	if (!result) throw new RecordError("invalid_input", `Unknown column: ${table.name}.${column}`);
	return result;
}
export function uuid(value: string): string {
	requireCondition(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),
		"Expected canonical UUID",
	);
	return value;
}
export function uint(value: string, positive = false): string {
	requireCondition(
		/^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 18446744073709551615n && (!positive || value !== "0"),
		"Expected exact unsigned 64-bit decimal",
	);
	return value;
}
export function utc(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{6})$/.exec(value);
	requireCondition(match, "Expected UTC YYYY-MM-DD HH:mm:ss.ffffff");
	const year = Number(match[1]),
		month = Number(match[2]),
		day = Number(match[3]);
	const days = [
		31,
		year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	];
	requireCondition(
		year >= 1000 &&
			month >= 1 &&
			month <= 12 &&
			day >= 1 &&
			day <= days[month - 1]! &&
			Number(match[4]) < 24 &&
			Number(match[5]) < 60 &&
			Number(match[6]) < 60,
		"Invalid UTC calendar timestamp",
	);
	return value;
}
export function digest(value: unknown): string {
	return new Bun.CryptoHasher("sha256").update(stableStringifyJson(value)).digest("hex");
}
export function hashCanonicalRow(row: CanonicalRow | null): string {
	return digest({ format: "hunt-row-hash-v1", row });
}
export function ownedFieldsHash(title: string, description: string): string {
	return digest({ title, description });
}

export type RawRecordRow = Record<string, string | null>;
interface CatalogColumn {
	table_name: string;
	column_name: string;
	data_type: string;
	column_type: string;
	is_nullable: string;
	column_default: string | null;
}
interface CatalogKey {
	table_name: string;
	constraint_name: string;
	column_name: string;
	referenced_table_name: string | null;
	referenced_column_name: string | null;
}
/** Parent validates installed schema source/version before accepting this physical catalog. */
export async function loadRecordCatalog(sql: ReservedSQL): Promise<RecordCatalog> {
	const columns = await sql.unsafe<CatalogColumn[]>(
		"SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type, COLUMN_TYPE AS column_type, IS_NULLABLE AS is_nullable, CAST(COLUMN_DEFAULT AS CHAR) AS column_default FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION",
	);
	const keys = await sql.unsafe<CatalogKey[]>(
		"SELECT TABLE_NAME AS table_name, CONSTRAINT_NAME AS constraint_name, COLUMN_NAME AS column_name, REFERENCED_TABLE_NAME AS referenced_table_name, REFERENCED_COLUMN_NAME AS referenced_column_name FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION",
	);
	const catalog = new Map<string, TableMetadata>();
	for (const name of RECORD_TABLES) {
		const physicalColumns = columns
			.filter(column => column.table_name === name)
			.map(column => ({
				name: column.column_name,
				dataType: column.data_type.toLowerCase(),
				columnType: column.column_type,
				nullable: column.is_nullable === "YES",
				defaultValue: column.column_default,
			}));
		requireCondition(physicalColumns.length, `Missing schema table: ${name}`);
		const tableKeys = keys.filter(key => key.table_name === name);
		const primaryKey = tableKeys.filter(key => key.constraint_name === "PRIMARY").map(key => key.column_name);
		requireCondition(primaryKey.length, `Missing primary key: ${name}`);
		const foreignKeys: ForeignKeyMetadata[] = [];
		for (const constraint of new Set(
			tableKeys.filter(key => key.referenced_table_name !== null).map(key => key.constraint_name),
		)) {
			const components = tableKeys.filter(key => key.constraint_name === constraint);
			const referencedTable = components[0]!.referenced_table_name!;
			requireCondition(tableNames.has(referencedTable), `Unexpected foreign table: ${referencedTable}`);
			foreignKeys.push({
				name: constraint,
				columns: components.map(key => key.column_name),
				referencedTable,
				referencedColumns: components.map(key => key.referenced_column_name!),
			});
		}
		catalog.set(name, { name, columns: physicalColumns, primaryKey, foreignKeys });
	}
	return catalog;
}
export function rowKey(catalog: RecordCatalog, table: string, row: Readonly<RawRecordRow>): RowKey {
	const key: Record<string, string> = {};
	for (const column of tableMetadata(catalog, table).primaryKey) {
		const value = row[column];
		requireCondition(typeof value === "string", `Missing primary key ${table}.${column}`);
		key[column] = value;
	}
	return key;
}
function completeKey(metadata: TableMetadata, key: RowKey): void {
	requireCondition(
		Object.keys(key).length === metadata.primaryKey.length &&
			metadata.primaryKey.every(column => typeof key[column] === "string"),
		`Expected complete primary key for ${metadata.name}`,
	);
}
export function checkpointHash(hash: string): string {
	requireCondition(/^[0-9a-v]{32}$/.test(hash), "Expected exact Dolt commit hash, not a branch/ref/expression");
	return hash;
}
function source(table: string, asOf?: string): { text: string; values: string[] } {
	// Dolt 2.6.2 resolves AS OF during COM_STMT_PREPARE, before bindings exist.
	// The revision is a validated 32-character hash; predicate values remain bound.
	return { text: identifier(table) + (asOf ? ` AS OF '${checkpointHash(asOf)}'` : ""), values: [] };
}
function projection(metadata: TableMetadata): string {
	return metadata.columns
		.map(column => {
			const name = identifier(column.name);
			// MySQL wire timestamps and BIGINT/JSON decoding must not reach Bun's Date/number conversions.
			const value =
				column.dataType === "datetime" || column.dataType === "timestamp"
					? `DATE_FORMAT(${name}, '%Y-%m-%d %H:%i:%s.%f')`
					: `CAST(${name} AS CHAR CHARACTER SET utf8mb4)`;
			return `${value} AS ${name}`;
		})
		.join(", ");
}
export async function readRows(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	where: RowKey = {},
	options: { asOf?: string; after?: RowKey; limit?: number } = {},
): Promise<RawRecordRow[]> {
	const metadata = tableMetadata(catalog, table);
	const from = source(table, options.asOf);
	const predicates: string[] = [];
	const values = from.values;
	for (const [column, value] of Object.entries(where)) {
		columnMetadata(metadata, column);
		requireCondition(typeof value === "string", "Filter values must be strings");
		predicates.push(`${identifier(column)} = ?`);
		values.push(value);
	}
	if (options.after) {
		completeKey(metadata, options.after);
		predicates.push(
			`(${metadata.primaryKey.map(identifier).join(", ")}) > (${metadata.primaryKey.map(() => "?").join(", ")})`,
		);
		for (const column of metadata.primaryKey) values.push(options.after[column]!);
	}
	if (options.limit !== undefined)
		requireCondition(
			Number.isInteger(options.limit) && options.limit > 0 && options.limit <= 10001,
			"Invalid row limit",
		);
	const query = `SELECT ${projection(metadata)} FROM ${from.text}${predicates.length ? ` WHERE ${predicates.join(" AND ")}` : ""} ORDER BY ${metadata.primaryKey.map(identifier).join(", ")}${options.limit ? ` LIMIT ${options.limit}` : ""}`;
	const result = await sql.unsafe<RawRecordRow[]>(query, values);
	for (const row of result)
		for (const column of metadata.columns)
			requireCondition(
				row[column.name] === null || typeof row[column.name] === "string",
				`Noncanonical SQL wire value: ${table}.${column.name}`,
			);
	return result;
}
export async function readRow(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	key: RowKey,
	asOf?: string,
): Promise<RawRecordRow | null> {
	completeKey(tableMetadata(catalog, table), key);
	const rows = await readRows(sql, catalog, table, key, { asOf, limit: 2 });
	requireCondition(rows.length <= 1, "Nonunique primary key result");
	return rows[0] ?? null;
}
export function canonicalRow(catalog: RecordCatalog, table: string, row: Readonly<RawRecordRow>): CanonicalRow {
	const columns: Record<string, CanonicalCell> = {};
	for (const column of tableMetadata(catalog, table).columns) {
		const value = row[column.name];
		requireCondition(value !== undefined, `Missing canonical column: ${column.name}`);
		columns[column.name] =
			value === null
				? { kind: "sql-null" }
				: column.dataType === "json"
					? { kind: "json-text", value }
					: { kind: "scalar", value };
	}
	return { format: "hunt-row-v1", table, key: rowKey(catalog, table, row), columns };
}
export async function readCanonicalRow(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	key: RowKey,
	asOf?: string,
): Promise<CanonicalRow | null> {
	const row = await readRow(sql, catalog, table, key, asOf);
	return row ? canonicalRow(catalog, table, row) : null;
}
function binding(column: ColumnMetadata, value: InputValue): string | null {
	if (value === null) {
		requireCondition(column.nullable, `NULL not allowed: ${column.name}`);
		return null;
	}
	if (column.dataType === "json") {
		requireCondition(
			typeof value === "object" &&
				value !== null &&
				Object.keys(value).length === 1 &&
				typeof value.json === "string",
			`Expected explicit JSON document: ${column.name}`,
		);
		return value.json;
	}
	requireCondition(typeof value === "string", `Expected exact string: ${column.name}`);
	if (column.dataType === "enum")
		requireCondition(
			[...column.columnType.matchAll(/'([^']*)'/g)].some(match => match[1] === value),
			`Unsupported enum value: ${column.name}`,
		);
	if (column.dataType === "bigint" && column.columnType.includes("unsigned")) uint(value);
	if (column.dataType === "datetime" || column.dataType === "timestamp") utc(value);
	if (/^char\(36\)/i.test(column.columnType)) uuid(value);
	if (column.name.endsWith("sha256")) requireCondition(/^[0-9a-f]{64}$/.test(value), `Invalid SHA-256: ${column.name}`);
	return value;
}
// Bun's installed declarations leave MySQL OK-packet metadata to the query generic.
interface SqlMutationResult {
	readonly affectedRows: number | bigint;
}

export async function insertRow(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	values: InputRow,
): Promise<void> {
	const metadata = tableMetadata(catalog, table);
	const entries = Object.entries(values);
	requireCondition(entries.length > 0, "Empty insertion");
	const result = await sql.unsafe<SqlMutationResult>(
		`INSERT INTO ${identifier(table)} (${entries.map(([column]) => identifier(column)).join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`,
		entries.map(([column, value]) => binding(columnMetadata(metadata, column), value)),
	);
	requireCondition(
		result.affectedRows === 1 || result.affectedRows === 1n,
		"Insertion did not affect exactly one row",
	);
}
export async function updateRow(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	key: RowKey,
	expectedRevision: string,
	values: InputRow,
): Promise<void> {
	const metadata = tableMetadata(catalog, table);
	completeKey(metadata, key);
	uint(expectedRevision, true);
	columnMetadata(metadata, "revision");
	const entries = Object.entries(values);
	requireCondition(
		!entries.some(([column]) => column === "revision" || metadata.primaryKey.includes(column)),
		"Revision/key is writer-owned",
	);
	const result = await sql.unsafe<SqlMutationResult>(
		`UPDATE ${identifier(table)} SET ${[...entries.map(([column]) => `${identifier(column)} = ?`), "revision = revision + 1"].join(", ")} WHERE ${metadata.primaryKey.map(column => `${identifier(column)} = ?`).join(" AND ")} AND revision = ?`,
		[
			...entries.map(([column, value]) => binding(columnMetadata(metadata, column), value)),
			...metadata.primaryKey.map(column => key[column]!),
			expectedRevision,
		],
	);
	if (String(result.affectedRows) !== "1") throw new RecordError("stale_revision", `CAS rejected: ${table}`);
}
export async function removeRelationRow(
	sql: ReservedSQL,
	catalog: RecordCatalog,
	table: string,
	key: RowKey,
): Promise<void> {
	const metadata = tableMetadata(catalog, table);
	completeKey(metadata, key);
	const result = await sql.unsafe<SqlMutationResult>(
		`DELETE FROM ${identifier(table)} WHERE ${metadata.primaryKey.map(column => `${identifier(column)} = ?`).join(" AND ")}`,
		metadata.primaryKey.map(column => key[column]!),
	);
	requireCondition(String(result.affectedRows) === "1", "Relationship removal did not affect exactly one row");
}

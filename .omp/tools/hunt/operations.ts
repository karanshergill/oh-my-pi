import { isRecord } from "@oh-my-pi/pi-utils/type-guards";
import type {
	ApplyRecordReceipt,
	CanonicalRow,
	CheckpointReason,
	InputRow,
	RecordCatalog,
	RecordWriteContext,
	RowKey,
	RowLocator,
	RowReceipt,
} from "./record-types";
import {
	canonicalRow,
	digest,
	hashCanonicalRow,
	insertRow,
	readCanonicalRow,
	readRow,
	requireCondition,
	tableMetadata,
	uint,
	updateRow,
	utc,
	uuid,
	type RawRecordRow,
} from "./record-sql";
import type { HuntConnection } from "./runtime";
import type { HuntOperationResult, RecorderTrace } from "./store-types";

export interface OperationIntent {
	readonly id: string;
	readonly kind: "initialize" | "save" | "checkpoint" | "export";
	readonly requestSha256: string;
	readonly recorder: RecorderTrace;
}

const reasons: Readonly<Record<CheckpointReason, true>> = {
	target_model: true,
	experiment_result: true,
	assessment: true,
	report: true,
	sync: true,
	handoff: true,
	other: true,
};
const writerIdentity = "omp:hunt-record-writer";
export async function sqlNow(connection: HuntConnection): Promise<string> {
	const [row] = await connection.sql.unsafe<{ recorded_at: string }[]>(
		"SELECT DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS recorded_at",
	);
	requireCondition(row && typeof row.recorded_at === "string", "SQL recording clock is unavailable");
	return utc(row.recorded_at);
}
export async function operationRow(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<RawRecordRow | null> {
	return readRow(connection.sql, catalog, "persistence_operations", { id: uuid(operationId) });
}
export async function captureReceiptRows(
	connection: HuntConnection,
	catalog: RecordCatalog,
	locators: readonly RowLocator[],
): Promise<RowReceipt[]> {
	const result: RowReceipt[] = [];
	for (const locator of locators) {
		const poststate = await readCanonicalRow(connection.sql, catalog, locator.table, locator.key);
		requireCondition(poststate, "Prepared recorder row disappeared");
		const revision = poststate.columns.revision;
		result.push({
			...locator,
			revision: revision?.kind === "scalar" ? revision.value : null,
			poststate,
			poststateSha256: hashCanonicalRow(poststate),
		});
	}
	return result;
}

export async function prepareRecorder(
	connection: HuntConnection,
	catalog: RecordCatalog,
	active: OperationIntent,
	initializing: boolean,
): Promise<{ context: RecordWriteContext; locators: RowLocator[] }> {
	const recordedAt = await sqlNow(connection);
	const locators: RowLocator[] = [];
	let actorId: string;
	if (initializing) {
		actorId = crypto.randomUUID();
		await insertRow(connection.sql, catalog, "actors", {
			id: actorId,
			actor_kind: "tool",
			external_identity: writerIdentity,
			label: "OMP hunt record writer",
			created_at: recordedAt,
		});
		locators.push({ table: "actors", key: { id: actorId } });
	} else {
		const engagement = await readRow(connection.sql, catalog, "engagements", { id: connection.engagementId });
		requireCondition(
			engagement && typeof engagement.recorder_actor_id === "string",
			"Missing initialized engagement recorder",
		);
		actorId = engagement.recorder_actor_id;
		const actor = await readRow(connection.sql, catalog, "actors", { id: actorId });
		requireCondition(
			actor?.actor_kind === "tool" && actor.external_identity === writerIdentity,
			"Engagement recorder is not the initializing writer",
		);
	}
	const runId = crypto.randomUUID();
	await insertRow(connection.sql, catalog, "runs", {
		id: runId,
		actor_id: actorId,
		native_run_identity: JSON.stringify([active.recorder.sessionId, active.recorder.toolCallId]),
		recorded_at: recordedAt,
		context: { json: JSON.stringify({ recorder: true, ...active.recorder }) },
	});
	locators.push({ table: "runs", key: { id: runId } });
	return {
		locators,
		context: {
			sql: connection.sql,
			catalog,
			engagementId: connection.engagementId,
			engagementRoot: connection.engagementRoot,
			operationId: active.id,
			recorderActorId: actorId,
			recorderRunId: runId,
			recordedAt,
			signal: connection.signal,
		},
	};
}

export async function prepareOperation(
	connection: HuntConnection,
	context: RecordWriteContext,
	active: OperationIntent,
): Promise<void> {
	await insertRow(connection.sql, context.catalog, "persistence_operations", {
		id: active.id,
		engagement_id: connection.engagementId,
		operation_kind: active.kind === "checkpoint" || active.kind === "export" ? active.kind : "record_write",
		request_sha256: active.requestSha256,
		sql_connection_id: connection.connectionId,
		sql_session_context: {
			json: JSON.stringify({
				format: "hunt-sql-session-v1",
				database: connection.database,
				bunVersion: Bun.version,
				doltVersion: "2.6.2",
			}),
		},
		state: "prepared",
		created_at: context.recordedAt,
		updated_at: context.recordedAt,
		recorder_actor_id: context.recorderActorId,
		recorder_run_id: context.recorderRunId,
		recorder_session_id: active.recorder.sessionId,
		recorder_tool_call_id: active.recorder.toolCallId,
		recorder_leaf_id: active.recorder.leafId,
	});
}

export async function updateOperation(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
	values: InputRow,
): Promise<void> {
	const row = await operationRow(connection, catalog, operationId);
	requireCondition(row && typeof row.revision === "string", "Persistence operation is missing");
	await updateRow(connection.sql, catalog, "persistence_operations", { id: operationId }, row.revision, {
		...values,
		updated_at: await sqlNow(connection),
	});
}

export async function sealReceipt(
	connection: HuntConnection,
	catalog: RecordCatalog,
	receipt: ApplyRecordReceipt,
	dispatchedAt: string,
): Promise<void> {
	const row = await operationRow(connection, catalog, receipt.operationId);
	requireCondition(
		row?.state === "prepared" && row.sql_result_receipt === null,
		"A saved operation receipt cannot be replaced",
	);
	await updateOperation(connection, catalog, receipt.operationId, {
		state: "sql_committed",
		sql_dispatched_at: dispatchedAt,
		// This value becomes visible only if the surrounding SQL COMMIT succeeds.
		sql_committed_at: await sqlNow(connection),
		sql_result_receipt: { json: JSON.stringify(receipt) },
	});
}

function parseKey(value: unknown, table: string, catalog: RecordCatalog): RowKey {
	requireCondition(isRecord(value), "Invalid receipt key");
	const columns = tableMetadata(catalog, table).primaryKey;
	requireCondition(Object.keys(value).length === columns.length, "Receipt key is incomplete");
	const key: Record<string, string> = {};
	for (const column of columns) {
		const cell = value[column];
		requireCondition(typeof cell === "string", "Invalid receipt key component");
		key[column] = cell;
	}
	return key;
}
function parsePoststate(value: unknown, table: string, key: RowKey, catalog: RecordCatalog): CanonicalRow | null {
	if (value === null) return null;
	requireCondition(
		isRecord(value) && value.format === "hunt-row-v1" && value.table === table && isRecord(value.columns),
		"Invalid canonical receipt row",
	);
	const raw: RawRecordRow = {};
	for (const column of tableMetadata(catalog, table).columns) {
		const cell = value.columns[column.name];
		requireCondition(isRecord(cell), "Missing canonical receipt cell");
		if (cell.kind === "sql-null") raw[column.name] = null;
		else {
			requireCondition(
				(cell.kind === "scalar" || cell.kind === "json-text") && typeof cell.value === "string",
				"Invalid canonical receipt scalar",
			);
			raw[column.name] = cell.value;
		}
	}
	const row = canonicalRow(catalog, table, raw);
	requireCondition(
		digest(row) === digest(value) && digest(row.key) === digest(key),
		"Receipt row/key encoding is inconsistent",
	);
	return row;
}
export function parseReceipt(text: string, operationId: string, catalog: RecordCatalog): ApplyRecordReceipt {
	const value: unknown = JSON.parse(text);
	requireCondition(
		isRecord(value) &&
			value.format === "hunt-record-receipt-v1" &&
			value.operationId === operationId &&
			Array.isArray(value.generatedIds) &&
			Array.isArray(value.rows) &&
			Array.isArray(value.checkpointReasons),
		"Unsupported or mismatched persistence receipt",
	);
	const generatedIds = value.generatedIds.map((item: unknown) => {
		requireCondition(
			isRecord(item) &&
				typeof item.changeIndex === "number" &&
				Number.isInteger(item.changeIndex) &&
				item.changeIndex >= 0 &&
				typeof item.table === "string" &&
				typeof item.id === "string",
			"Invalid generated record identity",
		);
		tableMetadata(catalog, item.table);
		return { changeIndex: item.changeIndex, table: item.table, id: uuid(item.id) };
	});
	const rows: RowReceipt[] = value.rows.map((item: unknown) => {
		requireCondition(
			isRecord(item) &&
				typeof item.table === "string" &&
				(item.revision === null || typeof item.revision === "string") &&
				typeof item.poststateSha256 === "string",
			"Invalid immutable row receipt",
		);
		const key = parseKey(item.key, item.table, catalog);
		const poststate = parsePoststate(item.poststate, item.table, key, catalog);
		if (item.revision !== null) uint(item.revision, true);
		requireCondition(hashCanonicalRow(poststate) === item.poststateSha256, "Immutable row receipt hash mismatch");
		const revisionCell = poststate?.columns.revision;
		requireCondition(
			item.revision === (revisionCell?.kind === "scalar" ? revisionCell.value : null),
			"Immutable receipt revision mismatch",
		);
		return { table: item.table, key, revision: item.revision, poststate, poststateSha256: item.poststateSha256 };
	});
	const checkpointReasons: CheckpointReason[] = [];
	for (const reason of value.checkpointReasons) {
		requireCondition(typeof reason === "string" && Object.hasOwn(reasons, reason), "Invalid checkpoint reason");
		checkpointReasons.push(reason as CheckpointReason);
	}
	return { format: "hunt-record-receipt-v1", operationId, generatedIds, rows, checkpointReasons };
}

export async function operationResult(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<HuntOperationResult> {
	const row = await operationRow(connection, catalog, operationId);
	requireCondition(
		row,
		"Persistence operation does not exist; inspect engagement status for an interrupted initialization",
	);
	const checkpointRows = await connection.sql.unsafe<
		{ id: string; state: HuntOperationResult["checkpoint"]["state"]; hash: string | null }[]
	>("SELECT id, state, commit_hash AS hash FROM checkpoints WHERE operation_id = ?", [operationId]);
	requireCondition(checkpointRows.length <= 1, "Nonunique checkpoint operation");
	const checkpoint = checkpointRows[0] ?? { id: null, state: "not_requested" as const, hash: null };
	const receiptText = row.sql_result_receipt;
	requireCondition(
		receiptText === null || typeof receiptText === "string",
		"Persistence receipt column is unavailable",
	);
	const receipt = receiptText === null ? null : parseReceipt(receiptText, operationId, catalog);
	return {
		kind: "operation",
		engagementId: connection.engagementId,
		operationId,
		sqlState: receipt ? "saved" : row.state === "failed" ? "not_saved" : "uncertain",
		receipt,
		checkpoint,
		detail: row.error_detail ?? null,
	};
}
export async function verifyRows(
	connection: HuntConnection,
	catalog: RecordCatalog,
	receipt: ApplyRecordReceipt,
	asOf?: string,
): Promise<void> {
	for (const row of receipt.rows) {
		const actual = await readCanonicalRow(connection.sql, catalog, row.table, row.key, asOf);
		requireCondition(
			hashCanonicalRow(actual) === row.poststateSha256,
			`Saved receipt differs from ${asOf ? "checkpoint" : "working"} record ${row.table}; inspect without overwriting`,
		);
	}
}

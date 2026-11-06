import { operationRow, parseReceipt, sqlNow, updateOperation, verifyRows } from "./operations";
import type { CheckpointReason, RecordCatalog } from "./record-types";
import { checkpointHash, insertRow, readRow, requireCondition, updateRow, type RawRecordRow } from "./record-sql";
import { assertConnectionFence, readRoots, selectEngagement, sqlTransaction, type HuntConnection } from "./runtime";
import { assertWorkingOwnership } from "./working";

/** Called inside the same SQL transaction as the immutable record receipt. */
export async function prepareCheckpoint(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
	parent: string,
	reason: CheckpointReason,
	detail: string | null,
): Promise<void> {
	const id = crypto.randomUUID();
	await insertRow(connection.sql, catalog, "checkpoints", {
		id,
		operation_id: operationId,
		reason,
		reason_detail: detail,
		expected_parent_hash: checkpointHash(parent),
		state: "pending",
		requested_at: await sqlNow(connection),
	});
	await insertRow(connection.sql, catalog, "checkpoint_operations", { checkpoint_id: id, operation_id: operationId });
}
export async function checkpointRow(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<RawRecordRow | null> {
	const rows = await connection.sql.unsafe<{ id: string }[]>("SELECT id FROM checkpoints WHERE operation_id = ?", [
		operationId,
	]);
	requireCondition(rows.length <= 1, "Nonunique checkpoint intent");
	return rows[0] ? readRow(connection.sql, catalog, "checkpoints", { id: rows[0].id }) : null;
}
async function commitRoot(connection: HuntConnection, hash: string): Promise<string> {
	try {
		await connection.sql.unsafe(`USE \`${connection.database}/${checkpointHash(hash)}\``);
		const [row] = await connection.sql.unsafe<{ root: string }[]>("SELECT DOLT_HASHOF_DB('HEAD') AS root");
		requireCondition(typeof row?.root === "string", "Native commit root is unavailable");
		return checkpointHash(row.root);
	} finally {
		await selectEngagement(connection);
	}
}
async function findCommit(connection: HuntConnection, marker: string): Promise<string | null> {
	const rows = await connection.sql.unsafe<{ hash: string }[]>(
		"SELECT commit_hash AS hash FROM dolt_log WHERE message = ?",
		[marker],
	);
	requireCondition(rows.length <= 1, "Checkpoint marker is not unique; no native mutation will be repeated");
	return rows[0] ? checkpointHash(rows[0].hash) : null;
}
async function acknowledge(
	connection: HuntConnection,
	catalog: RecordCatalog,
	checkpoint: RawRecordRow,
	operationId: string,
	hash: string,
): Promise<void> {
	requireCondition(
		typeof checkpoint.id === "string" && typeof checkpoint.revision === "string",
		"Checkpoint identity is incomplete",
	);
	await sqlTransaction(connection, async () => {
		const now = await sqlNow(connection);
		await updateRow(connection.sql, catalog, "checkpoints", { id: checkpoint.id! }, checkpoint.revision!, {
			state: "confirmed",
			commit_hash: hash,
			observed_commit_hash: hash,
			confirmed_at: now,
			error_detail: null,
		});
		await updateOperation(connection, catalog, operationId, {
			state: "completed",
			sql_settled_at: now,
			completed_at: now,
			error_detail: null,
		});
	});
}

/** Reconcile only persistence: the original target action and record batch are never rerun. */
export async function finishCheckpoint(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<void> {
	const operation = await operationRow(connection, catalog, operationId);
	const checkpoint = await checkpointRow(connection, catalog, operationId);
	requireCondition(
		operation &&
			typeof operation.sql_result_receipt === "string" &&
			checkpoint &&
			typeof checkpoint.id === "string" &&
			typeof checkpoint.expected_parent_hash === "string",
		"Saved operation has no complete checkpoint intent",
	);
	if (checkpoint.state === "confirmed" && operation.state === "completed") return;
	requireCondition(
		checkpoint.state === "pending" || checkpoint.state === "uncertain",
		"Checkpoint conflict requires inspection, not automatic repair",
	);
	const receipt = parseReceipt(operation.sql_result_receipt, operationId, catalog);
	const marker = `omp-hunt:${connection.engagementId}:${operationId}`;
	let hash = await findCommit(connection, marker);
	let intendedRoot: string | undefined;
	await assertWorkingOwnership(connection, catalog, operationId);
	if (!hash) {
		const before = await readRoots(connection);
		requireCondition(
			before.head === checkpoint.expected_parent_hash,
			"HEAD changed without the intended checkpoint marker; inspect before another commit",
		);
		const status = await connection.sql.unsafe<{ table_name: string }[]>("SELECT table_name FROM dolt_status");
		const tables = [...new Set(status.map(row => row.table_name))].sort();
		requireCondition(
			tables.length > 0 && tables.every(table => catalog.has(table)),
			"Working changes extend outside the installed record catalog",
		);
		intendedRoot = before.working;
		await assertConnectionFence(connection);
		await connection.sql.unsafe(`CALL DOLT_ADD(${tables.map(() => "?").join(", ")})`, tables);
		const staged = await readRoots(connection);
		requireCondition(
			staged.head === before.head && staged.working === intendedRoot && staged.staged === intendedRoot,
			"Staging differs from the intended complete working root; no commit was dispatched",
		);
		const result = await connection.sql.unsafe<{ hash: string }[]>("CALL DOLT_COMMIT('-m', ?)", [marker]);
		requireCondition(
			result.length === 1 && typeof result[0]?.hash === "string",
			"Dolt did not return a positive commit identity",
		);
		hash = checkpointHash(result[0].hash);
		requireCondition(
			(await findCommit(connection, marker)) === hash,
			"Commit reply differs from the unique recorded marker",
		);
	}
	const parents = await connection.sql.unsafe<{ hash: string | null; ordinal: string }[]>(
		"SELECT parent_hash AS hash, CAST(parent_index AS CHAR) AS ordinal FROM dolt_commit_ancestors WHERE commit_hash = ? ORDER BY parent_index",
		[hash],
	);
	requireCondition(
		parents.length === 1 && parents[0]!.hash === checkpoint.expected_parent_hash && parents[0]!.ordinal === "0",
		"Checkpoint parent differs from its recorded intent",
	);
	if (intendedRoot !== undefined)
		requireCondition(
			(await commitRoot(connection, hash)) === intendedRoot,
			"Committed root differs from the intended staged root",
		);
	const frozenOperation = await readRow(connection.sql, catalog, "persistence_operations", { id: operationId }, hash);
	const frozenCheckpoint = await readRow(connection.sql, catalog, "checkpoints", { id: checkpoint.id }, hash);
	const membership = await readRow(
		connection.sql,
		catalog,
		"checkpoint_operations",
		{ checkpoint_id: checkpoint.id, operation_id: operationId },
		hash,
	);
	requireCondition(
		frozenOperation?.request_sha256 === operation.request_sha256 &&
			frozenOperation?.sql_result_receipt === operation.sql_result_receipt &&
			frozenCheckpoint?.operation_id === operationId &&
			frozenCheckpoint.expected_parent_hash === checkpoint.expected_parent_hash &&
			membership,
		"Native history does not contain the exact intent and immutable receipt",
	);
	await verifyRows(connection, catalog, receipt, hash);
	await acknowledge(connection, catalog, checkpoint, operationId, hash);
}

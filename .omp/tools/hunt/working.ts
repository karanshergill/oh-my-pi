import { operationRow, parseReceipt, verifyRows } from "./operations";
import { reportExportSha256 } from "./record-artifacts";
import type { RecordCatalog } from "./record-types";
import { digest, identifier, readRow, requireCondition, uint, utc, type RawRecordRow } from "./record-sql";
import { readRoots, type HuntConnection } from "./runtime";
import { assertInitializationSchema } from "./schema";

interface TableDiff {
	from_table_name: string;
	to_table_name: string;
	schema_change: number;
}
const operationAckFields = ["state", "revision", "updated_at", "sql_settled_at", "completed_at", "error_detail"];
const checkpointAckFields = [
	"state",
	"revision",
	"commit_hash",
	"observed_commit_hash",
	"confirmed_at",
	"error_detail",
];
function text(row: RawRecordRow, column: string): string {
	const value = row[column];
	requireCondition(typeof value === "string", `Incomplete working metadata: ${column}`);
	return value;
}
function unchangedExcept(before: RawRecordRow, after: RawRecordRow, allowed: readonly string[]): void {
	for (const column of Object.keys(before))
		requireCondition(
			allowed.includes(column) || before[column] === after[column],
			`Unowned working metadata change: ${column}`,
		);
	requireCondition(
		BigInt(uint(text(after, "revision"), true)) === BigInt(uint(text(before, "revision"), true)) + 1n,
		"Unowned working metadata revision",
	);
}
function preparedOperation(connection: HuntConnection, row: RawRecordRow, activeId?: string): void {
	requireCondition(
		row.engagement_id === connection.engagementId &&
			(row.operation_kind === "record_write" ||
				row.operation_kind === "checkpoint" ||
				row.operation_kind === "export") &&
			/^[0-9a-f]{64}$/.test(text(row, "request_sha256")),
		"Unowned working operation intent",
	);
	uint(text(row, "sql_connection_id"), true);
	const session: unknown = JSON.parse(text(row, "sql_session_context"));
	requireCondition(
		digest(session) ===
			digest({
				format: "hunt-sql-session-v1",
				database: connection.database,
				bunVersion: "1.4.4",
				doltVersion: "2.6.2",
			}),
		"Unowned working SQL session context",
	);
	for (const field of ["created_at", "updated_at"]) utc(text(row, field));
	for (const field of ["recorder_session_id", "recorder_tool_call_id"])
		requireCondition(text(row, field).length > 0, "Missing actual recorder trace");
	if (row.id === activeId)
		requireCondition(row.state === "prepared" || row.state === "sql_committed", "Unexpected active operation state");
	else
		requireCondition(
			row.state === "failed" &&
				row.revision === "2" &&
				row.sql_result_receipt === null &&
				row.sql_dispatched_at === null &&
				row.sql_committed_at === null &&
				row.completed_at === null &&
				typeof row.error_detail === "string",
			"Unowned working operation outside the active receipt",
		);
	if (row.state === "failed") utc(text(row, "sql_settled_at"));
}
async function preparedRun(
	connection: HuntConnection,
	catalog: RecordCatalog,
	row: RawRecordRow,
	activeId?: string,
): Promise<void> {
	const candidates = await connection.sql.unsafe<{ id: string }[]>(
		"SELECT id FROM persistence_operations WHERE recorder_run_id = ? LIMIT 2",
		[text(row, "id")],
	);
	requireCondition(candidates.length === 1, "Unowned working run");
	const operation = await operationRow(connection, catalog, candidates[0]!.id);
	requireCondition(operation, "Prepared run has no operation");
	preparedOperation(connection, operation, activeId);
	const engagement = await readRow(connection.sql, catalog, "engagements", { id: connection.engagementId });
	const trace = {
		sessionId: operation.recorder_session_id,
		toolCallId: operation.recorder_tool_call_id,
		leafId: operation.recorder_leaf_id,
	};
	requireCondition(
		row.actor_id === engagement?.recorder_actor_id &&
			row.actor_id === operation.recorder_actor_id &&
			row.native_run_identity === JSON.stringify([trace.sessionId, trace.toolCallId]) &&
			row.recorded_at === operation.created_at &&
			row.started_at === null &&
			row.ended_at === null &&
			row.revision === "1" &&
			digest(JSON.parse(text(row, "context"))) === digest({ recorder: true, ...trace }),
		"Unowned working recorder row",
	);
}
async function acknowledgedCheckpoint(
	connection: HuntConnection,
	catalog: RecordCatalog,
	row: RawRecordRow,
	head: string,
): Promise<void> {
	requireCondition(
		row.state === "confirmed" &&
			row.commit_hash === head &&
			row.observed_commit_hash === head &&
			row.error_detail === null,
		"Unowned working checkpoint acknowledgement",
	);
	utc(text(row, "confirmed_at"));
	const operation = await operationRow(connection, catalog, text(row, "operation_id"));
	requireCondition(
		operation?.state === "completed" && operation.sql_result_receipt !== null,
		"Checkpoint acknowledgement has no completed operation",
	);
	const commits = await connection.sql.unsafe<{ hash: string }[]>(
		"SELECT commit_hash AS hash FROM dolt_log WHERE commit_hash = ? AND message = ?",
		[head, `omp-hunt:${connection.engagementId}:${row.operation_id}`],
	);
	requireCondition(commits.length === 1, "Acknowledgement lacks its native writer checkpoint");
}

/** The file phase starts only after this exact intent and finding CAS commit. */
async function preparedExportRows(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operation: RawRecordRow,
	head: string,
): Promise<string[]> {
	requireCondition(
		operation.state === "prepared" &&
			operation.revision === "1" &&
			operation.updated_at === operation.created_at &&
			operation.sql_dispatched_at === null &&
			operation.sql_committed_at === null &&
			operation.sql_settled_at === null &&
			operation.completed_at === null &&
			operation.error_detail === null,
		"Inconsistent prepared export operation",
	);
	const attempt = await readRow(connection.sql, catalog, "export_attempts", { id: text(operation, "id") });
	requireCondition(attempt, "Prepared export has no durable file intent");
	requireCondition(
		(attempt.previous_file_state === "absent" && attempt.previous_file_sha256 === null) ||
			(attempt.previous_file_state === "present" && /^[0-9a-f]{64}$/.test(text(attempt, "previous_file_sha256"))),
		"Prepared export has an invalid previous-file observation",
	);
	const finding = await readRow(connection.sql, catalog, "findings", { id: text(attempt, "finding_id") });
	const before = await readRow(connection.sql, catalog, "findings", { id: text(attempt, "finding_id") }, head);
	requireCondition(finding && before, "Prepared export finding is not in native history");
	unchangedExcept(before, finding, ["revision", "updated_at"]);
	requireCondition(
		finding.engagement_id === connection.engagementId &&
			finding.updated_at === operation.created_at &&
			finding.report_state === "current" &&
			finding.current_report_revision_id === attempt.intended_report_revision_id,
		"Prepared export changed more than the finding CAS",
	);
	const report = await readRow(connection.sql, catalog, "report_revisions", {
		id: text(attempt, "intended_report_revision_id"),
	});
	requireCondition(report?.finding_id === finding.id, "Prepared export report belongs to another finding");
	requireCondition(
		digest(attempt) ===
			digest({
				id: operation.id,
				operation_id: operation.id,
				finding_id: finding.id,
				intended_report_revision_id: report.id,
				intended_file_sha256: reportExportSha256(text(report, "title"), text(report, "body")),
				previous_file_state: attempt.previous_file_state,
				previous_file_sha256: attempt.previous_file_sha256,
				observed_file_sha256: null,
				result: "prepared",
				revision: "1",
				started_at: operation.created_at,
				finished_at: null,
				detail: null,
			}) &&
			operation.request_sha256 ===
				digest({
					action: "export",
					engagementId: connection.engagementId,
					operationId: operation.id,
					finding: { id: finding.id, revision: before.revision },
					reportRevisionId: report.id,
				}),
		"Prepared export does not match its original request",
	);
	requireCondition(
		(await readRow(connection.sql, catalog, "export_attempts", { id: text(attempt, "id") }, head)) === null,
		"Prepared export attempt already exists in native history",
	);
	return [`findings:${digest({ id: finding.id })}`, `export_attempts:${digest({ id: attempt.id })}`];
}

/** Native history is the baseline. Only the active receipt, exact prepared export,
 * and recognizable post-checkpoint ACK / failed-preparation rows may differ. */
export async function assertWorkingOwnership(
	connection: HuntConnection,
	catalog: RecordCatalog,
	activeId?: string,
): Promise<void> {
	const roots = await readRoots(connection);
	const active = activeId ? await operationRow(connection, catalog, activeId) : null;
	const receipt = active?.sql_result_receipt ? parseReceipt(active.sql_result_receipt, activeId!, catalog) : null;
	if (receipt) await verifyRows(connection, catalog, receipt);
	const owned = new Set(receipt?.rows.map(row => `${row.table}:${digest(row.key)}`));
	if (active?.operation_kind === "export" && !receipt)
		for (const row of await preparedExportRows(connection, catalog, active, roots.head)) owned.add(row);
	const engagement = await readRow(connection.sql, catalog, "engagements", { id: connection.engagementId });
	const initial = active && active.recorder_run_id === engagement?.recorder_run_id;
	const cpRows = activeId
		? await connection.sql.unsafe<{ id: string; expected_parent_hash: string }[]>(
				"SELECT id, expected_parent_hash FROM checkpoints WHERE operation_id = ?",
				[activeId],
			)
		: [];
	requireCondition(cpRows.length <= 1, "Unowned checkpoint membership");
	const cp = cpRows[0];
	const [head] = await connection.sql.unsafe<{ message: string }[]>(
		"SELECT message FROM dolt_log WHERE commit_hash = ?",
		[roots.head],
	);
	if (initial && head?.message !== `omp-hunt:${connection.engagementId}:${activeId}`) {
		const history = await connection.sql.unsafe<{ count: string }[]>(
			"SELECT CAST(COUNT(*) AS CHAR) AS count FROM dolt_log",
		);
		requireCondition(history[0]?.count === "1", "Unexpected native history during initialization");
	} else if (!activeId || head?.message !== `omp-hunt:${connection.engagementId}:${activeId}`) {
		const acknowledged = await connection.sql.unsafe<{ id: string }[]>(
			"SELECT id FROM checkpoints WHERE commit_hash = ? AND state = 'confirmed'",
			[roots.head],
		);
		requireCondition(acknowledged.length === 1, "Unowned native HEAD; inspect before modifying working records");
	}
	requireCondition(
		roots.staged === roots.headRoot || (activeId && roots.staged === roots.working),
		"Unowned staged changes; inspect before checkpointing",
	);
	const differences = await connection.sql
		.unsafe<TableDiff[]>(
			`SELECT from_table_name, to_table_name, schema_change FROM DOLT_DIFF_SUMMARY('${roots.head}', 'WORKING')`,
		)
		.simple();
	if (initial) {
		// Initial HEAD has no installed tables. Its exception is owned only by
		// the native schema fingerprint captured before the first metadata batch.
		await assertInitializationSchema(connection, text(active, "id"), text(active, "request_sha256"));
	} else {
		const schemas = await connection.sql
			.unsafe(`SELECT * FROM DOLT_SCHEMA_DIFF('${roots.head}', 'WORKING')`)
			.simple();
		requireCondition(
			schemas.length === 0 &&
				differences.every(row => Number(row.schema_change) === 0 && row.from_table_name === row.to_table_name),
			"Unowned working schema changes",
		);
	}
	requireCondition(
		roots.working === roots.headRoot || differences.length > 0,
		"Unexplained native working-root change",
	);
	for (const difference of differences) {
		const table = difference.to_table_name;
		const metadata = catalog.get(table);
		requireCondition(metadata, `Unowned working table: ${table}`);
		// Initial tables have no from_ columns. A fresh initialization may contain
		// only the installed versions, its receipt and its persistence intent.
		const keys = initial
			? await connection.sql.unsafe<RawRecordRow[]>(
					`SELECT ${metadata.primaryKey.map(column => `CAST(${identifier(column)} AS CHAR) AS ${identifier(column)}`).join(", ")} FROM ${identifier(table)}`,
				)
			: await connection.sql
					.unsafe<RawRecordRow[]>(
						`SELECT ${metadata.primaryKey.map(column => `COALESCE(CAST(${identifier(`to_${column}`)} AS CHAR), CAST(${identifier(`from_${column}`)} AS CHAR)) AS ${identifier(column)}`).join(", ")} FROM DOLT_DIFF('${roots.head}', 'WORKING', '${table}')`,
					)
					.simple();
		for (const item of keys) {
			const key: Record<string, string> = {};
			for (const column of metadata.primaryKey) key[column] = text(item, column);
			if (owned.has(`${table}:${digest(key)}`)) continue;
			if (initial && table === "schema_versions" && (key.version === "1" || key.version === "2")) continue;
			const current = await readRow(connection.sql, catalog, table, key);
			requireCondition(current, `Unowned working removal: ${table}`);
			const before = initial ? null : await readRow(connection.sql, catalog, table, key, roots.head);
			if (table === "runs" && !before) {
				await preparedRun(connection, catalog, current, activeId);
				continue;
			}
			if (table === "persistence_operations") {
				if (!before) {
					preparedOperation(connection, current, activeId);
					continue;
				}
				unchangedExcept(before, current, operationAckFields);
				requireCondition(
					before.state === "sql_committed" && current.state === "completed" && current.error_detail === null,
					"Unowned working operation transition",
				);
				for (const field of ["updated_at", "completed_at", "sql_settled_at"]) utc(text(current, field));
				const checkpointIds = await connection.sql.unsafe<{ id: string }[]>(
					"SELECT id FROM checkpoints WHERE operation_id = ?",
					[text(current, "id")],
				);
				requireCondition(checkpointIds.length === 1, "Unowned operation acknowledgement");
				const checkpoint = await readRow(connection.sql, catalog, "checkpoints", { id: checkpointIds[0]!.id });
				requireCondition(checkpoint, "Missing acknowledged checkpoint");
				await acknowledgedCheckpoint(connection, catalog, checkpoint, roots.head);
				continue;
			}
			if (table === "checkpoints") {
				if (!before) {
					requireCondition(
						current.id === cp?.id &&
							current.operation_id === activeId &&
							current.state === "pending" &&
							current.expected_parent_hash === roots.head,
						"Unowned working checkpoint intent",
					);
					continue;
				}
				unchangedExcept(before, current, checkpointAckFields);
				requireCondition(before.state === "pending", "Checkpoint acknowledgement changed after confirmation");
				await acknowledgedCheckpoint(connection, catalog, current, roots.head);
				continue;
			}
			if (
				table === "checkpoint_operations" &&
				!before &&
				key.operation_id === activeId &&
				key.checkpoint_id === cp?.id
			)
				continue;
			requireCondition(false, `Unowned working record: ${table}; inspect without overwriting`);
		}
	}
	const after = await readRoots(connection);
	requireCondition(
		after.head === roots.head && after.working === roots.working && after.staged === roots.staged,
		"Working state changed while checking ownership",
	);
}

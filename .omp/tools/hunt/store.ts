import { checkpointRow, finishCheckpoint, prepareCheckpoint } from "./checkpoint";
import {
	inspectReportFile,
	publishReportFile,
	verifyAndFlushReport,
	type ReportPublication,
	type VerifiedReportFile,
} from "./export-file";
import {
	captureReceiptRows,
	operationResult,
	operationRow,
	prepareOperation,
	prepareRecorder,
	sealReceipt,
	sqlNow,
	updateOperation,
	type OperationIntent,
} from "./operations";
import { preserveArtifactFile, type ExpectedArtifactFile, type PreservedArtifactFile } from "./preserve-artifact";
import { reportExportSha256, verifyPreservedArtifact } from "./record-artifacts";
import { applyRecordChanges, inspectRecords } from "./records";
import type { ApplyRecordReceipt, HuntChange, RecordCatalog, RecordWriteContext, RowLocator } from "./record-types";
import {
	digest,
	identifier,
	insertRow,
	readRow,
	RecordError,
	requireCondition,
	uint,
	uuid,
	type RawRecordRow,
} from "./record-sql";
import {
	assertInitializationSchema,
	databaseExists,
	initializationDescription,
	loadHuntSchema,
	validateInstalledSchema,
	type HuntSchema,
} from "./schema";
import {
	ensureEngagementDirectories,
	readRoots,
	selectEngagement,
	sqlTransaction,
	SqlTransactionError,
	withEngagementConnection,
	type HuntConnection,
} from "./runtime";
import type {
	HuntOperationResult,
	HuntRequest,
	HuntResult,
	HuntStatusResult,
	InitializeHuntRequest,
	RecorderTrace,
	SaveHuntRequest,
	CheckpointHuntRequest,
	HuntPreservationResult,
	PreserveHuntRequest,
	ExportHuntRequest,
	HuntExportResult,
} from "./store-types";
import { assertWorkingOwnership } from "./working";

async function pendingOperation(connection: HuntConnection, catalog: RecordCatalog): Promise<RawRecordRow | null> {
	const rows = await connection.sql.unsafe<{ id: string }[]>(
		"SELECT id FROM persistence_operations WHERE state IN ('prepared', 'sql_committed', 'uncertain') ORDER BY created_at, id LIMIT 2",
	);
	requireCondition(rows.length <= 1, "Multiple unsettled operations require inspection; refusing another mutation");
	return rows[0] ? operationRow(connection, catalog, rows[0].id) : null;
}
async function requireEngagement(connection: HuntConnection): Promise<boolean> {
	const rows = await connection.sql.unsafe<{ id: string }[]>("SELECT id FROM engagements");
	requireCondition(
		rows.length === 0 || (rows.length === 1 && rows[0]!.id === connection.engagementId),
		"Database contains a different engagement; refusing adoption",
	);
	return rows.length === 1;
}
async function status(connection: HuntConnection, catalog: RecordCatalog): Promise<HuntStatusResult> {
	const pending = await pendingOperation(connection, catalog);
	let phase: HuntStatusResult["phase"] = pending ? "unsettled" : "ready";
	let detail = pending?.error_detail ?? null;
	try {
		await assertWorkingOwnership(connection, catalog, pending?.id ?? undefined);
	} catch (error) {
		if (!(error instanceof RecordError)) throw error;
		phase = "conflict";
		detail = error.message;
	}
	return {
		kind: "status",
		engagementId: connection.engagementId,
		database: connection.database,
		phase,
		activeOperationId: pending?.id ?? null,
		pendingStep:
			phase === "conflict"
				? "inspect_working_changes"
				: pending
					? pending.sql_result_receipt
						? "checkpoint"
						: pending.operation_kind === "export"
							? "reconcile_export"
							: "settle_sql"
					: null,
		observed: await readRoots(connection),
		detail,
	};
}
function absentStatus(connection: HuntConnection): HuntStatusResult {
	return {
		kind: "status",
		engagementId: connection.engagementId,
		database: connection.database,
		phase: "absent",
		activeOperationId: null,
		pendingStep: null,
		observed: null,
		detail: null,
	};
}
async function requireUninitializedIntent(
	connection: HuntConnection,
	catalog: RecordCatalog,
	request: InitializeHuntRequest,
): Promise<void> {
	await assertInitializationSchema(connection, request.operationId, digest(request));
	for (const table of catalog.keys()) {
		if (table === "schema_versions") continue;
		const rows = await connection.sql.unsafe(`SELECT 1 AS occupied FROM ${identifier(table)} LIMIT 1`);
		requireCondition(
			rows.length === 0,
			"Uninitialized database contains record data; inspect instead of replaying initialization",
		);
	}
}
async function installSchema(
	connection: HuntConnection,
	schema: HuntSchema,
	request: InitializeHuntRequest,
): Promise<RecordCatalog> {
	await ensureEngagementDirectories(connection.runtime, connection.engagementId);
	// CREATE without IF NOT EXISTS is deliberate: never adopt a partial or foreign database.
	await connection.sql.unsafe(`CREATE DATABASE \`${connection.database}\``);
	await selectEngagement(connection);
	for (const definition of schema.definitions) {
		await connection.sql.unsafe(definition.sql).simple();
		const description =
			definition === schema.definitions.at(-1)
				? await initializationDescription(connection, request.operationId, digest(request))
				: definition.file;
		await connection.sql.unsafe(
			"INSERT INTO schema_versions (version, applied_at, definition_sha256, description) VALUES (?, UTC_TIMESTAMP(6), ?, ?)",
			[definition.version, definition.sha256, description],
		);
	}
	return validateInstalledSchema(connection, schema);
}
async function finish(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<HuntOperationResult> {
	await finishCheckpoint(connection, catalog, operationId);
	return operationResult(connection, catalog, operationId);
}
async function resume(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<HuntOperationResult | HuntExportResult> {
	const operation = await operationRow(connection, catalog, operationId);
	requireCondition(
		operation,
		"Unknown operation: inspect the engagement; never infer rollback or rerun a target action from a missing receipt",
	);
	const isExport = operation.operation_kind === "export";
	if (operation.state === "completed" || operation.state === "failed") {
		const result = await operationResult(connection, catalog, operationId);
		return isExport ? exportResult(connection, catalog, result) : result;
	}
	const pending = await pendingOperation(connection, catalog);
	requireCondition(pending?.id === operationId, "Requested operation is not the sole unsettled operation");
	if (typeof operation.sql_result_receipt === "string") {
		const result = await finish(connection, catalog, operationId);
		return isExport ? exportResult(connection, catalog, result) : result;
	}
	requireCondition(
		operation.state === "prepared" &&
			operation.sql_committed_at === null &&
			(await checkpointRow(connection, catalog, operationId)) === null,
		"Inconsistent operation intent requires inspection",
	);
	await assertWorkingOwnership(connection, catalog, operationId);
	if (isExport) {
		const state = await readExportState(connection, catalog, operationId);
		const observed = await observeExportFile(connection, state, true);
		return completeExport(connection, catalog, operationId, observed);
	}
	// The newly acquired connection-owned lease joins the previous handler. Its
	// batch and receipt are atomic: no visible receipt now proves no committed batch.
	await sqlTransaction(connection, async () =>
		updateOperation(connection, catalog, operationId, {
			state: "failed",
			sql_settled_at: await sqlNow(connection),
			error_detail:
				"The settled SQL connection left no committed record batch. No domain changes or target actions were replayed.",
		}),
	);
	return operationResult(connection, catalog, operationId);
}
async function completeBatch(
	connection: HuntConnection,
	catalog: RecordCatalog,
	context: RecordWriteContext,
	locators: readonly RowLocator[],
	request: InitializeHuntRequest | SaveHuntRequest | CheckpointHuntRequest,
	parent: string,
): Promise<void> {
	const receipt: ApplyRecordReceipt =
		request.action === "save"
			? await applyRecordChanges(context, request.changes)
			: {
					format: "hunt-record-receipt-v1",
					operationId: request.operationId,
					generatedIds: [],
					rows: [],
					checkpointReasons: [request.action === "checkpoint" ? request.reason : "other"],
				};
	const fullReceipt: ApplyRecordReceipt = {
		...receipt,
		rows: [...(await captureReceiptRows(connection, catalog, locators)), ...receipt.rows],
	};
	await sealReceipt(connection, catalog, fullReceipt, context.recordedAt);
	await prepareCheckpoint(
		connection,
		catalog,
		request.operationId,
		parent,
		receipt.checkpointReasons[0] ?? "other",
		request.action === "checkpoint" ? (request.detail ?? null) : null,
	);
}
async function initialize(
	connection: HuntConnection,
	catalog: RecordCatalog,
	request: InitializeHuntRequest,
	intent: OperationIntent,
): Promise<HuntOperationResult> {
	const parent = (await readRoots(connection)).head;
	await sqlTransaction(connection, async () => {
		const { context, locators } = await prepareRecorder(connection, catalog, intent, true);
		await insertRow(connection.sql, catalog, "engagements", {
			id: connection.engagementId,
			name: request.name,
			objective: request.objective ?? null,
			context_gaps: request.contextGaps ?? null,
			created_at: context.recordedAt,
			updated_at: context.recordedAt,
			recorder_actor_id: context.recorderActorId,
			recorder_run_id: context.recorderRunId,
		});
		locators.push({ table: "engagements", key: { id: connection.engagementId } });
		await prepareOperation(connection, context, intent);
		await completeBatch(connection, catalog, context, locators, request, parent);
	});
	return finish(connection, catalog, request.operationId);
}
async function preservedEvidenceChange(
	connection: HuntConnection,
	catalog: RecordCatalog,
	request: PreserveHuntRequest,
): Promise<{ change: HuntChange; artifact: PreservedArtifactFile }> {
	const evidence = request.evidence;
	const current = await readRow(connection.sql, catalog, "evidence", { id: uuid(evidence.id) });
	let expected: ExpectedArtifactFile | undefined;
	if (evidence.mode === "create") {
		requireCondition(current === null, "Evidence ID already exists; inspect before preserving another source");
	} else {
		requireCondition(
			current &&
				current.engagement_id === connection.engagementId &&
				current.revision === uint(evidence.revision, true),
			"Evidence identity or revision changed; no artifact was copied",
		);
		expected = {
			...(current.sha256 === null ? {} : { sha256: current.sha256 }),
			...(current.byte_count === null ? {} : { byteCount: current.byte_count }),
		};
	}
	const artifact = await preserveArtifactFile(
		connection.engagementRoot,
		request.sourcePath,
		expected,
		connection.signal,
	);
	const fields = {
		local_preservation: "preserved" as const,
		artifact_relative_path: artifact.relativePath,
		sha256: artifact.sha256,
		byte_count: artifact.byteCount,
	};
	const change: HuntChange =
		evidence.mode === "create"
			? { kind: "create", table: "evidence", id: evidence.id, fields: { ...evidence.fields, ...fields } }
			: { kind: "edit", table: "evidence", id: evidence.id, expectedRevision: evidence.revision, fields };
	return { change, artifact };
}
async function replayPreservation(
	connection: HuntConnection,
	request: PreserveHuntRequest,
	operation: HuntOperationResult,
): Promise<HuntPreservationResult> {
	let artifact: PreservedArtifactFile | null = null;
	let detail: string | null = null;
	if (operation.sqlState === "saved") {
		const row = operation.receipt?.rows.find(
			row => row.table === "evidence" && row.key.id === request.evidence.id,
		)?.poststate;
		const preservation = row?.columns.local_preservation;
		const relativePath = row?.columns.artifact_relative_path;
		const sha256 = row?.columns.sha256;
		const byteCount = row?.columns.byte_count;
		requireCondition(
			preservation?.kind === "scalar" &&
				preservation.value === "preserved" &&
				relativePath?.kind === "scalar" &&
				sha256?.kind === "scalar" &&
				byteCount?.kind === "scalar",
			"Saved preservation receipt does not identify its evidence artifact",
		);
		try {
			await verifyPreservedArtifact(connection.engagementRoot, relativePath.value, sha256.value, byteCount.value);
			artifact = { relativePath: relativePath.value, sha256: sha256.value, byteCount: byteCount.value };
		} catch (error) {
			detail = `Historical SQL receipt retained, but preserved bytes could not be verified: ${error instanceof Error ? error.message : String(error)}`;
		}
	} else {
		detail =
			"No saved artifact receipt. This replay did not copy the source; unregistered immutable bytes may remain.";
	}
	return { kind: "preservation", engagementId: connection.engagementId, operation, artifact, detail };
}

async function save(
	connection: HuntConnection,
	catalog: RecordCatalog,
	request: SaveHuntRequest | CheckpointHuntRequest | PreserveHuntRequest,
	intent: OperationIntent,
): Promise<HuntOperationResult | HuntPreservationResult> {
	const prepared = await sqlTransaction(connection, async () => {
		const prepared = await prepareRecorder(connection, catalog, intent, false);
		await prepareOperation(connection, prepared.context, intent);
		return prepared;
	});
	let artifact: PreservedArtifactFile | null = null;
	let batchStarted = false;
	let rolledBack = false;
	try {
		let batchRequest: SaveHuntRequest | CheckpointHuntRequest;
		if (request.action === "preserve") {
			const preserved = await preservedEvidenceChange(connection, catalog, request);
			artifact = preserved.artifact;
			batchRequest = {
				action: "save",
				engagementId: request.engagementId,
				operationId: request.operationId,
				changes: [preserved.change],
			};
		} else {
			batchRequest = request;
		}
		const parent = (await readRoots(connection)).head;
		batchStarted = true;
		await sqlTransaction(connection, async () =>
			completeBatch(connection, catalog, prepared.context, prepared.locators, batchRequest, parent),
		);
	} catch (error) {
		const noRecordBatch = request.action === "preserve" && !batchStarted;
		if (!noRecordBatch && (!(error instanceof SqlTransactionError) || error.outcome !== "rolled_back")) throw error;
		const message = error instanceof Error ? error.message : String(error);
		await sqlTransaction(connection, async () =>
			updateOperation(connection, catalog, request.operationId, {
				state: "failed",
				sql_settled_at: await sqlNow(connection),
				error_detail: artifact
					? `${message}; verified bytes retained at ${artifact.relativePath} (${artifact.byteCount} bytes), but evidence registration failed.`
					: message,
			}),
		);
		rolledBack = true;
	}
	const operation = rolledBack
		? await operationResult(connection, catalog, request.operationId)
		: await finish(connection, catalog, request.operationId);
	if (request.action !== "preserve") return operation;
	return {
		kind: "preservation",
		engagementId: connection.engagementId,
		operation,
		artifact,
		detail:
			operation.sqlState === "saved"
				? null
				: artifact
					? "Verified immutable bytes were retained, but evidence registration did not complete."
					: "Artifact bytes were not confirmed; the evidence record batch was not saved.",
	};
}

interface ExportState {
	readonly findingId: string;
	readonly reportRevisionId: string;
	readonly title: string;
	readonly body: string;
	readonly intendedHash: string;
	readonly previousHash: string | null;
	readonly attempt: NonNullable<HuntExportResult["attempt"]>;
}
async function readExportState(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
): Promise<ExportState> {
	const attempt = await readRow(connection.sql, catalog, "export_attempts", { id: operationId });
	requireCondition(
		attempt?.operation_id === operationId &&
			typeof attempt.finding_id === "string" &&
			typeof attempt.intended_report_revision_id === "string" &&
			typeof attempt.revision === "string",
		"Export operation has no complete durable file intent",
	);
	const report = await readRow(connection.sql, catalog, "report_revisions", {
		id: attempt.intended_report_revision_id,
	});
	requireCondition(
		report?.finding_id === attempt.finding_id && typeof report.title === "string" && typeof report.body === "string",
		"Export report is unavailable or belongs to another finding",
	);
	const result = attempt.result;
	requireCondition(
		result === "prepared" ||
			result === "uncertain" ||
			result === "succeeded" ||
			result === "conflict" ||
			result === "failed",
		"Unknown recorded export result",
	);
	const intendedHash = reportExportSha256(report.title, report.body);
	requireCondition(
		intendedHash === attempt.intended_file_sha256,
		"Export intent no longer matches its immutable report",
	);
	return {
		findingId: attempt.finding_id,
		reportRevisionId: attempt.intended_report_revision_id,
		title: report.title,
		body: report.body,
		intendedHash,
		previousHash: attempt.previous_file_sha256,
		attempt: { id: operationId, revision: uint(attempt.revision, true), result },
	};
}
/** Observation/flush only: neither recovery nor replay can publish report bytes. */
async function observeExportFile(
	connection: HuntConnection,
	state: ExportState,
	flush: boolean,
): Promise<ReportPublication> {
	try {
		const observed = await inspectReportFile(connection.engagementRoot, state.findingId);
		if (observed.state === "present" && observed.sha256 === state.intendedHash) {
			const file: VerifiedReportFile = {
				relativePath: `exports/${state.findingId}.md`,
				sha256: observed.sha256,
				byteCount: observed.byteCount,
			};
			if (flush) await verifyAndFlushReport(connection.engagementRoot, file);
			return {
				result: "succeeded",
				file,
				detail: "Verified existing canonical report bytes without rewriting them",
			};
		}
		return {
			result: observed.state === "absent" || observed.sha256 === state.previousHash ? "failed" : "conflict",
			file: null,
			detail:
				observed.state === "absent"
					? "The report file is absent; no file was restored"
					: "The report file differs from the intended revision; existing bytes were preserved",
		};
	} catch (error) {
		return {
			result: "uncertain",
			file: null,
			detail: `Report bytes could not be verified; no file was published or repaired: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
async function exportResult(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operation: HuntOperationResult,
): Promise<HuntExportResult> {
	const state = await readExportState(connection, catalog, operation.operationId);
	const observed = await observeExportFile(connection, state, false);
	return {
		kind: "export",
		engagementId: connection.engagementId,
		findingId: state.findingId,
		reportRevisionId: state.reportRevisionId,
		operation,
		attempt: state.attempt,
		file: observed.file,
		detail: observed.file ? null : `${observed.detail}. The original operation receipt is unchanged.`,
	};
}
async function completeExport(
	connection: HuntConnection,
	catalog: RecordCatalog,
	operationId: string,
	publication: ReportPublication,
): Promise<HuntExportResult> {
	await assertWorkingOwnership(connection, catalog, operationId);
	const operation = await operationRow(connection, catalog, operationId);
	requireCondition(
		operation?.operation_kind === "export" &&
			typeof operation.recorder_actor_id === "string" &&
			typeof operation.recorder_run_id === "string",
		"Export recorder provenance is unavailable",
	);
	const recorderActorId = operation.recorder_actor_id;
	const recorderRunId = operation.recorder_run_id;
	const state = await readExportState(connection, catalog, operationId);
	const finding = await readRow(connection.sql, catalog, "findings", { id: state.findingId });
	requireCondition(finding && typeof finding.revision === "string", "Export finding is unavailable");
	const findingRevision = finding.revision;
	const parent = (await readRoots(connection)).head;
	// Rollback leaves the detailed prepared intent intact. Resume observes the
	// filesystem; it never repeats publication, even if this COMMIT is uncertain.
	await sqlTransaction(connection, async () => {
		const context: RecordWriteContext = {
			...connection,
			catalog,
			operationId,
			recorderActorId,
			recorderRunId,
			recordedAt: await sqlNow(connection),
		};
		await completeBatch(
			connection,
			catalog,
			context,
			[{ table: "runs", key: { id: context.recorderRunId } }],
			{
				action: "save",
				engagementId: connection.engagementId,
				operationId,
				changes: [
					{
						kind: "export-outcome",
						attempt: { table: "export_attempts", id: state.attempt.id, revision: state.attempt.revision },
						finding: { table: "findings", id: state.findingId, revision: findingRevision },
						result: publication.result,
						detail: publication.detail,
					},
				],
			},
			parent,
		);
	});
	return exportResult(connection, catalog, await finish(connection, catalog, operationId));
}
async function exportReport(
	connection: HuntConnection,
	catalog: RecordCatalog,
	request: ExportHuntRequest,
	intent: OperationIntent,
): Promise<HuntExportResult> {
	const findingId = uuid(request.finding.id);
	const report = await readRow(connection.sql, catalog, "report_revisions", { id: uuid(request.reportRevisionId) });
	const finding = await readRow(connection.sql, catalog, "findings", { id: findingId });
	requireCondition(
		finding?.engagement_id === connection.engagementId &&
			report?.finding_id === findingId &&
			typeof report.title === "string" &&
			typeof report.body === "string",
		"Export requires this engagement's finding and report",
	);
	const title = report.title;
	const body = report.body;
	const previous = await inspectReportFile(connection.engagementRoot, findingId);
	await sqlTransaction(connection, async () => {
		const prepared = await prepareRecorder(connection, catalog, intent, false);
		await prepareOperation(connection, prepared.context, intent);
		await applyRecordChanges(prepared.context, [
			{
				kind: "export-intent",
				id: request.operationId,
				finding: { table: "findings", ...request.finding },
				reportRevisionId: request.reportRevisionId,
				intendedFileSha256: reportExportSha256(title, body),
				previousFileState: previous.state,
				...(previous.state === "present" ? { previousFileSha256: previous.sha256 } : {}),
			},
		]);
	});
	const publication = await publishReportFile(
		{
			engagementRoot: connection.engagementRoot,
			findingId,
			title,
			body,
			previous,
			lastExportedHash: finding.last_exported_file_sha256,
		},
		connection.signal,
	);
	return completeExport(connection, catalog, request.operationId, publication);
}

/** All record mutation participates in this writer and its one managed local server. */
export async function executeHuntRequest(
	request: HuntRequest,
	recorder: RecorderTrace,
	signal?: AbortSignal,
): Promise<HuntResult> {
	uuid(request.engagementId);
	if ("operationId" in request) uuid(request.operationId);
	return withEngagementConnection(
		request.engagementId,
		async connection => {
			const schema = await loadHuntSchema(connection.runtime);
			const exists = await databaseExists(connection);
			if (!exists && request.action === "status") return absentStatus(connection);
			const mutating =
				request.action === "initialize" ||
				request.action === "save" ||
				request.action === "checkpoint" ||
				request.action === "preserve" ||
				request.action === "export";
			if (!exists) {
				requireCondition(
					request.action === "initialize",
					"Engagement database is absent; initialization requires explicit engagement and operation UUIDs",
				);
				requireCondition(request.name.trim().length > 0, "Engagement name must not be empty");
				const catalog = await installSchema(connection, schema, request);
				return initialize(connection, catalog, request, {
					id: request.operationId,
					kind: request.action,
					requestSha256: digest(request),
					recorder,
				});
			}
			await selectEngagement(connection);
			let catalog: RecordCatalog;
			try {
				catalog = await validateInstalledSchema(connection, schema);
			} catch (error) {
				if (
					request.action !== "status" ||
					!(error instanceof RecordError || (error instanceof Error && "errno" in error && error.errno === 1146))
				)
					throw error;
				return {
					...absentStatus(connection),
					phase: "incomplete",
					observed: await readRoots(connection),
					detail: error.message,
				};
			}
			if (!(await requireEngagement(connection))) {
				if (request.action === "status")
					return {
						...absentStatus(connection),
						phase: "incomplete",
						pendingStep: "initialize",
						observed: await readRoots(connection),
						detail:
							"Schema installed but initialization did not commit; only the exact original initialize request may seed this empty database.",
					};
				requireCondition(
					request.action === "initialize",
					"Engagement initialization is incomplete; inspect and repeat only the exact original initialize request",
				);
				await requireUninitializedIntent(connection, catalog, request);
				return initialize(connection, catalog, request, {
					id: request.operationId,
					kind: request.action,
					requestSha256: digest(request),
					recorder,
				});
			}
			if (request.action === "status") return status(connection, catalog);
			if (request.action === "inspect")
				return {
					kind: "records",
					engagementId: connection.engagementId,
					coordination: await status(connection, catalog),
					data: await inspectRecords({ ...connection, catalog }, request.query),
				};
			if (request.action === "operation") {
				const recorded = await operationRow(connection, catalog, request.operationId);
				const result = await operationResult(connection, catalog, request.operationId);
				return recorded?.operation_kind === "export" ? exportResult(connection, catalog, result) : result;
			}
			if (request.action === "resume") return resume(connection, catalog, request.operationId);
			requireCondition(mutating, "Unsupported hunt request");
			const previous = await operationRow(connection, catalog, request.operationId);
			if (previous) {
				requireCondition(
					previous.request_sha256 === digest(request),
					"Operation UUID already belongs to different input",
				);
				const operation = await operationResult(connection, catalog, request.operationId);
				if (request.action === "preserve") return replayPreservation(connection, request, operation);
				return request.action === "export" ? exportResult(connection, catalog, operation) : operation;
			}
			requireCondition(
				request.action !== "initialize",
				"Existing engagement cannot be initialized again; inspect its recorded state",
			);
			const pending = await pendingOperation(connection, catalog);
			requireCondition(!pending, `Unsettled operation ${pending?.id}: inspect or resume it before another mutation`);
			await assertWorkingOwnership(connection, catalog);
			const intent: OperationIntent = {
				id: request.operationId,
				kind: request.action === "preserve" ? "save" : request.action,
				requestSha256: digest(request),
				recorder,
			};
			return request.action === "export"
				? exportReport(connection, catalog, request, intent)
				: save(connection, catalog, request, intent);
		},
		signal,
	);
}

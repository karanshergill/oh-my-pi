import { stableStringifyJson } from "@oh-my-pi/pi-utils/json";
import type {
	ApplyRecordReceipt,
	CanonicalRow,
	CheckpointReason,
	HuntChange,
	InputRow,
	InputValue,
	InspectRecordsRequest,
	InspectRecordsResult,
	RecordCatalog,
	RecordReadContext,
	RecordWriteContext,
	RevisionGuard,
	RowKey,
	RowLocator,
	RowReceipt,
	VerificationEvidenceLink,
	VerificationExperimentLink,
} from "./record-types";
import type { RawRecordRow } from "./record-sql";
import {
	canonicalRow,
	checkpointHash,
	digest,
	hashCanonicalRow,
	insertRow,
	ownedFieldsHash,
	readCanonicalRow,
	readRow,
	readRows,
	RecordError,
	removeRelationRow,
	requireCondition,
	rowKey,
	tableMetadata,
	uint,
	updateRow,
	utc,
	uuid,
} from "./record-sql";
import { reportExportSha256, verifyPreservedArtifact, verifyReportExport } from "./record-artifacts";

// This is a mutability/ownership policy, not a duplicate physical SQL schema.
const createFields: Readonly<Record<string, string>> = {
	actors: "actor_kind external_identity label",
	runs: "actor_id native_run_identity started_at ended_at context",
	engagements: "name objective context_gaps",
	native_projects: "tool_name instance_id project_id label",
	test_identities: "label role_context tenant_context",
	engagement_references:
		"reference_kind source_locator source_version retrieved_at native_project_id native_object_id content_summary",
	evidence:
		"source_description source_url captured_at capture_time_note media_type byte_count sha256 capture_completeness capture_detail local_preservation artifact_relative_path preservation_detail derivation_kind execution_context",
	research_sources:
		"original_url collection_provenance collection_kind collected_at published_at relevant_dates_versions applicability",
	surfaces: "label observed_features interfaces workflows technology_facts technology_assumptions",
	target_models:
		"observed_behavior observed_relationships state_chronology trust_boundaries labeled_assumptions material_unknowns",
	target_model_claims: "target_model_id claim claim_kind context",
	approach_families: "mechanism_or_assumption distinguishing_rationale",
	investigations: "hypothesis mechanism input_to_effect_path context outcome assessment blockers next_action",
	investigation_propositions: "investigation_id proposition_kind statement status assessment",
	experiments:
		"investigation_id hypothesis_tested baseline controls variations execution_context predicted_signal recording_mode execution_time_notes planned_at",
	findings: "assessment readiness_gaps",
};
const editFields: Readonly<Record<string, string>> = {
	runs: "ended_at context",
	engagements: createFields.engagements!,
	native_projects: "label",
	test_identities: createFields.test_identities!,
	engagement_references: "content_summary",
	evidence: "local_preservation preservation_detail sha256 byte_count artifact_relative_path",
	research_sources: "applicability",
	surfaces: createFields.surfaces!,
	target_models: createFields.target_models!,
	target_model_claims: "claim claim_kind context",
	approach_families: createFields.approach_families!,
	investigations: createFields.investigations!,
	investigation_propositions: "proposition_kind statement status assessment",
	experiments:
		"hypothesis_tested baseline controls variations execution_context predicted_signal execution_time_notes planned_at",
};
interface OwnerPolicy {
	readonly table: string;
	readonly column: string;
}
const owners: Readonly<Record<string, OwnerPolicy>> = {
	target_model_claims: { table: "target_models", column: "target_model_id" },
	investigation_propositions: { table: "investigations", column: "investigation_id" },
	experiments: { table: "investigations", column: "investigation_id" },
	evidence_native_references: { table: "evidence", column: "evidence_id" },
	evidence_derivations: { table: "evidence", column: "derived_evidence_id" },
	engagement_reference_evidence: { table: "engagement_references", column: "engagement_reference_id" },
	research_source_evidence: { table: "research_sources", column: "research_source_id" },
	surface_evidence: { table: "surfaces", column: "surface_id" },
	surface_research_sources: { table: "surfaces", column: "surface_id" },
	target_model_surfaces: { table: "target_models", column: "target_model_id" },
	target_model_claim_evidence: { table: "target_model_claims", column: "target_model_claim_id" },
	target_model_claim_observations: { table: "target_model_claims", column: "target_model_claim_id" },
	investigation_approach_families: { table: "investigations", column: "investigation_id" },
	investigation_surfaces: { table: "investigations", column: "investigation_id" },
	investigation_model_claims: { table: "investigations", column: "investigation_id" },
	investigation_research_sources: { table: "investigations", column: "investigation_id" },
	investigation_evidence: { table: "investigations", column: "investigation_id" },
	investigation_proposition_evidence: { table: "investigation_propositions", column: "proposition_id" },
	experiment_test_identities: { table: "experiments", column: "experiment_id" },
	experiment_evidence: { table: "experiments", column: "experiment_id" },
	observations: { table: "experiments", column: "experiment_id" },
	observation_evidence: { table: "observations", column: "observation_id" },
	finding_investigations: { table: "findings", column: "finding_id" },
	finding_evidence: { table: "findings", column: "finding_id" },
	finding_contributors: { table: "findings", column: "finding_id" },
	finding_claim_revisions: { table: "findings", column: "finding_id" },
	finding_claim_evidence: { table: "finding_claim_revisions", column: "finding_claim_revision_id" },
	verifications: { table: "findings", column: "finding_id" },
	verification_experiments: { table: "verifications", column: "verification_id" },
	verification_evidence: { table: "verifications", column: "verification_id" },
	verification_contradictions: { table: "verifications", column: "verification_id" },
	report_revisions: { table: "findings", column: "finding_id" },
	report_revision_evidence: { table: "report_revisions", column: "report_revision_id" },
	report_checkpoints: { table: "findings", column: "finding_id" },
	export_attempts: { table: "findings", column: "finding_id" },
	caido_links: { table: "findings", column: "finding_id" },
	sync_attempts: { table: "caido_links", column: "caido_link_id" },
	contradiction_claims: { table: "contradictions", column: "contradiction_id" },
	contradiction_evidence: { table: "contradictions", column: "contradiction_id" },
	contradiction_events: { table: "contradictions", column: "contradiction_id" },
	contradiction_event_evidence: { table: "contradiction_events", column: "contradiction_event_id" },
};
const relationFields: Readonly<Record<string, string>> = {
	evidence_native_references: "evidence_id native_project_id object_kind native_object_id variant",
	evidence_derivations: "derived_evidence_id original_evidence_id transformation",
	engagement_reference_evidence: "engagement_reference_id evidence_id",
	research_source_evidence: "research_source_id evidence_id",
	surface_evidence: "surface_id evidence_id relationship",
	surface_research_sources: "surface_id research_source_id",
	target_model_surfaces: "target_model_id surface_id",
	target_model_claim_evidence: "target_model_claim_id evidence_id relationship",
	target_model_claim_observations: "target_model_claim_id observation_id relationship",
	investigation_approach_families: "investigation_id approach_family_id",
	investigation_surfaces: "investigation_id surface_id",
	investigation_model_claims: "investigation_id target_model_claim_id role",
	investigation_research_sources: "investigation_id research_source_id applicability",
	investigation_evidence: "investigation_id evidence_id relationship",
	investigation_proposition_evidence: "proposition_id evidence_id relationship",
	experiment_test_identities: "experiment_id test_identity_id context_snapshot",
	experiment_evidence: "experiment_id evidence_id role",
	finding_investigations: "finding_id investigation_id",
	finding_evidence: "finding_id evidence_id relationship",
	finding_contributors: "finding_id actor_id run_id contribution",
};
const removableRelations: Readonly<Record<string, true>> = {
	surface_evidence: true,
	surface_research_sources: true,
	target_model_surfaces: true,
	target_model_claim_evidence: true,
	target_model_claim_observations: true,
	investigation_approach_families: true,
	investigation_surfaces: true,
	investigation_model_claims: true,
	investigation_research_sources: true,
	investigation_evidence: true,
	investigation_proposition_evidence: true,
	experiment_test_identities: true,
	experiment_evidence: true,
	finding_investigations: true,
	finding_evidence: true,
};
const administrative: Readonly<Record<string, true>> = {
	schema_versions: true,
	persistence_operations: true,
	checkpoints: true,
	checkpoint_operations: true,
	report_revisions: true,
	report_revision_evidence: true,
	report_checkpoints: true,
	export_attempts: true,
	caido_links: true,
	sync_attempts: true,
};
const provenanceColumns: Readonly<Record<string, true>> = { recorder_actor_id: true, recorder_run_id: true };
function fields(input: object, allowed: string): Record<string, InputValue> {
	const permitted = new Set(allowed.split(" "));
	const result: Record<string, InputValue> = {};
	for (const [key, value] of Object.entries(input)) {
		requireCondition(permitted.has(key), `Field is not writable: ${key}`);
		if (value === undefined) continue;
		requireCondition(
			value === null ||
				typeof value === "string" ||
				(typeof value === "object" &&
					Object.keys(value).length === 1 &&
					typeof Reflect.get(value, "json") === "string"),
			`Invalid input value: ${key}`,
		);
		result[key] = value as InputValue;
	}
	return result;
}
function text(row: Readonly<RawRecordRow>, name: string): string {
	const value = row[name];
	requireCondition(typeof value === "string", `Missing ${name}`);
	return value;
}
function nonempty(value: string | undefined, label: string): string {
	requireCondition(typeof value === "string" && value.trim().length > 0, `${label} must be explicit`);
	return value;
}
function next(value: string): string {
	return uint((BigInt(uint(value, true)) + 1n).toString(), true);
}
function locatorToken(locator: RowLocator): string {
	return stableStringifyJson(locator);
}
function inputKey(context: RecordReadContext, table: string, input: InputRow): RowKey {
	const key: Record<string, string> = {};
	for (const column of tableMetadata(context.catalog, table).primaryKey) {
		const value = input[column];
		requireCondition(typeof value === "string", `Missing key: ${column}`);
		key[column] = value;
	}
	return key;
}
async function mustRead(context: RecordReadContext, table: string, key: RowKey, asOf?: string): Promise<RawRecordRow> {
	context.signal?.throwIfAborted();
	const row = await readRow(context.sql, context.catalog, table, key, asOf);
	if (!row) throw new RecordError("not_found", `Record does not exist: ${table}`);
	return row;
}
async function validateReadContext(context: RecordReadContext, asOf?: string): Promise<void> {
	uuid(context.engagementId);
	requireCondition(
		context.engagementRoot.endsWith(`/engagements/${context.engagementId}`),
		"Explicit engagement root does not match engagement UUID",
	);
	const engagement = await mustRead(context, "engagements", { id: context.engagementId }, asOf);
	requireCondition(engagement.singleton === "1", "Invalid singleton engagement");
}
async function confirmCheckpoint(context: RecordReadContext, hash: string): Promise<void> {
	checkpointHash(hash);
	const records = await readRows(context.sql, context.catalog, "checkpoints", { commit_hash: hash });
	requireCondition(
		records.length === 1 && records[0]!.state === "confirmed",
		"Checkpoint is not positively confirmed",
	);
	// AS OF actually executes; unavailable history is an error, never an empty successful read.
	await validateReadContext(context, hash);
}

class RecordBatch {
	readonly affected = new Map<string, RowLocator>();
	readonly generatedIds: { changeIndex: number; table: string; id: string }[] = [];
	readonly checkpointReasons = new Set<CheckpointReason>();
	changeIndex = 0;
	constructor(readonly context: RecordWriteContext) {}
	id(table: string, provided?: string): string {
		const id = uuid(provided ?? Bun.randomUUIDv7());
		if (!provided) this.generatedIds.push({ changeIndex: this.changeIndex, table, id });
		return id;
	}
	track(table: string, key: RowKey): void {
		const locator = { table, key };
		this.affected.set(locatorToken(locator), locator);
	}
	async get(table: string, id: string): Promise<RawRecordRow> {
		return mustRead(this.context, table, { id: uuid(id) });
	}
	async guard(guard: RevisionGuard, table: string, id?: string): Promise<RawRecordRow> {
		requireCondition(
			guard.table === table && (id === undefined || guard.id === id),
			`Expected owner CAS for ${table}`,
		);
		uint(guard.revision, true);
		const row = await this.get(table, guard.id);
		if (row.revision !== guard.revision) throw new RecordError("stale_revision", `Stale owner revision: ${table}`);
		return row;
	}
	async references(table: string, values: InputRow): Promise<void> {
		const metadata = tableMetadata(this.context.catalog, table);
		for (const foreign of metadata.foreignKeys) {
			const key: Record<string, string> = {};
			let incomplete = false;
			for (let index = 0; index < foreign.columns.length; index++) {
				const value = values[foreign.columns[index]!];
				if (value === undefined || value === null) {
					incomplete = true;
					break;
				}
				requireCondition(typeof value === "string", "Foreign keys must be strings");
				key[foreign.referencedColumns[index]!] = value;
			}
			if (incomplete) continue;
			const rows = await readRows(this.context.sql, this.context.catalog, foreign.referencedTable, key, {
				limit: 2,
			});
			requireCondition(rows.length === 1, `Missing/nonunique reference: ${table}.${foreign.name}`);
			if (foreign.referencedTable === "engagements")
				requireCondition(rows[0]!.id === this.context.engagementId, "Cross-engagement reference");
		}
	}
	async add(table: string, input: InputRow): Promise<RawRecordRow> {
		this.context.signal?.throwIfAborted();
		const metadata = tableMetadata(this.context.catalog, table);
		const values: Record<string, InputValue> = { ...input };
		const has = (name: string): boolean => metadata.columns.some(column => column.name === name);
		if (has("engagement_id") && table !== "contradiction_claims") values.engagement_id = this.context.engagementId;
		if (has("recorder_actor_id")) values.recorder_actor_id = this.context.recorderActorId;
		if (has("recorder_run_id")) values.recorder_run_id = this.context.recorderRunId;
		for (const column of ["created_at", "updated_at", "recorded_at"])
			if (has(column)) values[column] = this.context.recordedAt;
		if (has("revision")) values.revision = "1";
		await this.references(table, values);
		await insertRow(this.context.sql, this.context.catalog, table, values);
		const key = inputKey(this.context, table, values);
		this.track(table, key);
		return mustRead(this.context, table, key);
	}
	async revise(table: string, row: Readonly<RawRecordRow>, input: InputRow): Promise<RawRecordRow> {
		this.context.signal?.throwIfAborted();
		const values: Record<string, InputValue> = { ...input };
		if ("updated_at" in row) values.updated_at = this.context.recordedAt;
		// Original recorder provenance remains intact; operation receipt attributes this edit.
		const complete: Record<string, InputValue> = { ...row, ...values };
		await this.references(table, complete);
		const key = rowKey(this.context.catalog, table, row);
		await updateRow(this.context.sql, this.context.catalog, table, key, text(row, "revision"), values);
		this.track(table, key);
		return mustRead(this.context, table, key);
	}
	async owner(table: string, row: InputRow, guard?: RevisionGuard): Promise<RawRecordRow | null> {
		const policy = owners[table];
		if (!policy) {
			requireCondition(!guard, "This record has no mutable parent owner");
			return null;
		}
		const id = row[policy.column];
		requireCondition(typeof id === "string" && guard, `Owner CAS is required for ${table}`);
		const parent = await this.guard(guard, policy.table, id);
		await this.revise(policy.table, parent, {});
		return parent;
	}
	reason(table: string): void {
		this.checkpointReasons.add(
			table.startsWith("target_model")
				? "target_model"
				: table === "experiments" || table === "observations"
					? "experiment_result"
					: "assessment",
		);
	}
	async invalidate(start: RowLocator, reason: string, explicitEngagementScope = false): Promise<void> {
		// Reverse FK traversal finds all users of evidence/models/surfaces. Owned joins then
		// climb to their revision owner. Stop at findings; do not invalidate unrelated users
		// merely because they share the engagement, actor, or run.
		const queue: RowLocator[] = [start];
		// Only an explicitly engagement-scoped contradiction expands this boundary.
		// Encountering an engagement through ordinary provenance must not fan out.
		if (explicitEngagementScope && start.table === "engagements") {
			const affected = await readRows(
				this.context.sql,
				this.context.catalog,
				"findings",
				{ engagement_id: start.key.id! },
				{ limit: 10001 },
			);
			requireCondition(affected.length <= 10000, "Engagement finding set exceeds operation bound");
			for (const finding of affected) queue.push({ table: "findings", key: { id: text(finding, "id") } });
		}
		const visited = new Set<string>();
		const findings = new Set<string>();
		while (queue.length) {
			const locator = queue.shift()!;
			const token = locatorToken(locator);
			if (visited.has(token)) continue;
			visited.add(token);
			requireCondition(visited.size <= 10000, "Support graph exceeds operation bound; split the operation");
			const row = await readRow(this.context.sql, this.context.catalog, locator.table, locator.key);
			if (!row) continue;
			if (locator.table === "experiments" && row.execution_state === "planned") continue;
			if (locator.table === "contradiction_claims") {
				for (const [table, column] of Object.entries(contradictionReferenceColumns))
					if (row[column]) queue.push({ table, key: { id: text(row, column) } });
			}
			if (locator.table === "findings") {
				findings.add(text(row, "id"));
				continue;
			}
			if (["actors", "runs", "engagements", "native_projects", "test_identities"].includes(locator.table)) continue;
			const parent = owners[locator.table];
			if (parent && row[parent.column]) queue.push({ table: parent.table, key: { id: text(row, parent.column) } });
			for (const metadata of this.context.catalog.values()) {
				if (Object.hasOwn(administrative, metadata.name)) continue;
				for (const foreign of metadata.foreignKeys) {
					if (
						foreign.referencedTable !== locator.table ||
						foreign.columns.some(column => Object.hasOwn(provenanceColumns, column))
					)
						continue;
					const filter: Record<string, string> = {};
					let usable = true;
					for (let index = 0; index < foreign.columns.length; index++) {
						const value = row[foreign.referencedColumns[index]!];
						if (value === null || value === undefined) {
							usable = false;
							break;
						}
						filter[foreign.columns[index]!] = value;
					}
					if (!usable) continue;
					const matches = await readRows(this.context.sql, this.context.catalog, metadata.name, filter, {
						limit: 10001,
					});
					requireCondition(matches.length <= 10000, "Support fanout exceeds operation bound");
					for (const dependent of matches)
						queue.push({ table: metadata.name, key: rowKey(this.context.catalog, metadata.name, dependent) });
				}
			}
		}
		for (const id of findings) {
			const finding = await this.get("findings", id);
			const previousGaps = finding.readiness_gaps?.trim();
			const addedGap = stableStringifyJson({
				reason,
				requiredAction: "Reassess current claim coverage and independent verification against changed support",
			});
			// Existing JSON is already parsed/validated by Dolt. Splice only its outer array
			// delimiter, never parse its numbers into JavaScript or discard earlier gaps.
			const gaps = !previousGaps
				? `[${addedGap}]`
				: previousGaps.startsWith("[")
					? `${previousGaps.slice(0, -1)}${previousGaps.slice(1, -1).trim() ? "," : ""}${addedGap}]`
					: `[${previousGaps},${addedGap}]`;
			await this.revise("findings", finding, {
				support_revision: next(text(finding, "support_revision")),
				readiness: finding.readiness === "disputed" ? "disputed" : "needs_verification",
				readiness_gaps: { json: gaps },
				report_state: finding.current_report_revision_id ? "stale" : "missing",
				report_staleness_reason: finding.current_report_revision_id ? reason : null,
				export_state: staleExportState(finding),
			});
		}
		if (findings.size) this.checkpointReasons.add("assessment");
	}
	async preserved(row: Readonly<RawRecordRow>): Promise<void> {
		if (row.local_preservation === "preserved")
			await verifyPreservedArtifact(
				this.context.engagementRoot,
				text(row, "artifact_relative_path"),
				text(row, "sha256"),
				text(row, "byte_count"),
			);
	}
	async create(change: Extract<HuntChange, { kind: "create" }>): Promise<void> {
		const allowed = createFields[change.table];
		requireCondition(allowed, "Unsupported ordinary record creation");
		const values = fields(change.fields, allowed);
		const id = change.table === "engagements" ? this.context.engagementId : this.id(change.table, change.id);
		if (change.table === "engagements")
			requireCondition(change.id === undefined || change.id === id, "Engagement UUID mismatch");
		await this.owner(change.table, values, change.owner);
		if (change.table === "experiments") {
			values.execution_state = "planned";
			if (values.recording_mode === "prospective" && values.planned_at === undefined)
				values.planned_at = this.context.recordedAt;
		}
		if (change.table === "findings") {
			values.readiness = "incomplete";
			values.report_state = "missing";
			values.export_state = "missing";
			const reported = values.readiness_gaps;
			requireCondition(
				reported === undefined || reported === null || typeof reported === "object",
				"Expected JSON readiness gaps",
			);
			values.readiness_gaps = {
				json: `{"attributionGap":"Actual originators and substantial developers must be explicitly recorded; the recorder is not inferred to be an author","reportedGaps":${reported?.json ?? "null"}}`,
			};
		}
		if (change.table === "actors")
			nonempty(
				typeof values.external_identity === "string" ? values.external_identity : undefined,
				"External actor identity",
			);
		await this.add(change.table, { ...values, id });
		if (change.table !== "experiments" && change.table !== "findings") {
			await this.invalidate({ table: change.table, key: { id } }, "Supporting record created");
			this.reason(change.table);
		}
	}
	async edit(change: Extract<HuntChange, { kind: "edit" }>): Promise<void> {
		const allowed = editFields[change.table];
		requireCondition(allowed, "Record is immutable; append a new attributed record instead");
		const values = fields(change.fields, allowed);
		requireCondition(Object.keys(values).length, "Empty edit is not a lifecycle transition");
		const row = await this.guard(
			{ table: change.table, id: change.id, revision: change.expectedRevision },
			change.table,
		);
		if (change.table === "experiments")
			requireCondition(
				row.execution_state === "planned" && row.conditions_frozen_at === null,
				"Started experiment conditions are frozen; record corrections as observations",
			);
		if (change.table === "runs") {
			if (values.ended_at !== undefined && row.ended_at !== null)
				requireCondition(values.ended_at === row.ended_at, "Known run completion time is retained, not rewritten");
			if (values.context !== undefined) {
				const experiments = await readRows(
					this.context.sql,
					this.context.catalog,
					"experiments",
					{ executor_run_id: change.id },
					{ limit: 1 },
				);
				const verifications = await readRows(
					this.context.sql,
					this.context.catalog,
					"verifications",
					{ verifying_run_id: change.id },
					{ limit: 1 },
				);
				requireCondition(
					experiments.length === 0 && verifications.length === 0,
					"Execution/verification run context is frozen once used; retain corrections as observations or a new run",
				);
			}
		}
		if (change.table === "evidence") {
			for (const column of ["sha256", "byte_count", "artifact_relative_path"])
				if (values[column] !== undefined && row[column] !== null)
					requireCondition(
						values[column] === row[column],
						"Registered artifact identity is immutable; preserve corrections as a new evidence record",
					);
			if (["sha256", "byte_count", "artifact_relative_path"].some(column => values[column] !== undefined))
				requireCondition(
					values.local_preservation === "preserved",
					"Artifact identity may only be registered with verified existing bytes",
				);
		}
		await this.owner(change.table, row, change.owner);
		const updated = await this.revise(change.table, row, values);
		const materialChange = Object.keys(values).some(
			column => column !== "next_action" && row[column] !== updated[column],
		);
		if (materialChange && !["experiments", "runs", "native_projects", "test_identities"].includes(change.table)) {
			await this.invalidate({ table: change.table, key: { id: change.id } }, "Supporting record changed");
			this.reason(change.table);
		}
	}
	async relation(change: Extract<HuntChange, { kind: "relation" }>): Promise<void> {
		const allowed = relationFields[change.table];
		requireCondition(allowed, "This membership is frozen; supply it with its immutable owner creation");
		const values = fields(change.fields, allowed);
		const policy = owners[change.table]!;
		const ownerId = values[policy.column];
		requireCondition(typeof ownerId === "string", "Missing relation owner");
		const owner = await this.guard(change.owner, policy.table, ownerId);
		if (change.table === "experiment_test_identities" && change.action === "add") {
			const identity = await this.get("test_identities", String(values.test_identity_id));
			const supplied = values.context_snapshot;
			requireCondition(
				supplied === undefined || supplied === null || typeof supplied === "object",
				"Expected JSON context snapshot",
			);
			values.context_snapshot = {
				json: `{"identity":${stableStringifyJson({ id: identity.id, label: identity.label, role_context: identity.role_context, tenant_context: identity.tenant_context, revision: identity.revision })},"context":${supplied?.json ?? "null"}}`,
			};
		}
		if (policy.table === "experiments") {
			const frozen = owner.conditions_frozen_at !== null;
			requireCondition(
				!frozen ||
					(change.table === "experiment_evidence" &&
						change.action === "add" &&
						["result", "reconciliation"].includes(String(values.role))),
				"Frozen experiment identities, input evidence, scripts and execution context cannot change",
			);
			if (values.role === "reproducer_script") {
				const artifact = await this.get("evidence", String(values.evidence_id));
				requireCondition(
					artifact.local_preservation === "preserved",
					"Reproducer must be an exact preserved artifact",
				);
				await this.preserved(artifact);
			}
		}
		if (
			change.table === "finding_evidence" &&
			values.relationship === "reproducer_script" &&
			change.action === "add"
		) {
			const artifact = await this.get("evidence", String(values.evidence_id));
			requireCondition(
				artifact.local_preservation === "preserved",
				"Finding reproducer must be an exact preserved artifact",
			);
			await this.preserved(artifact);
		}
		if (change.table === "evidence_derivations") {
			const derived = await this.get("evidence", String(values.derived_evidence_id));
			requireCondition(derived.derivation_kind === "derived", "Derivation requires a derived evidence record");
			const queue = [String(values.original_evidence_id)];
			const seen = new Set<string>();
			while (queue.length) {
				const current = queue.shift()!;
				requireCondition(current !== values.derived_evidence_id, "Cyclic evidence derivation");
				if (seen.has(current)) continue;
				seen.add(current);
				requireCondition(seen.size <= 10000, "Evidence ancestry exceeds operation bound");
				for (const edge of await readRows(this.context.sql, this.context.catalog, "evidence_derivations", {
					derived_evidence_id: current,
				}))
					queue.push(text(edge, "original_evidence_id"));
			}
		}
		if (change.action === "remove") {
			requireCondition(
				Object.hasOwn(removableRelations, change.table),
				"Provenance and historical associations are append-only",
			);
			const key = inputKey(this.context, change.table, values);
			await mustRead(this.context, change.table, key);
			// The parent must checkpoint before this operation can supersede a required pending version.
			if (!(policy.table === "experiments" && owner.execution_state === "planned"))
				await this.invalidate({ table: policy.table, key: { id: ownerId } }, "Supporting membership removed");
			await removeRelationRow(this.context.sql, this.context.catalog, change.table, key);
			this.track(change.table, key);
			const currentOwner = await this.get(policy.table, ownerId);
			await this.revise(policy.table, currentOwner, {});
		} else {
			requireCondition(change.action === "add", "Unknown relation action");
			if (change.table === "evidence_native_references") values.id = this.id(change.table, change.id);
			await this.revise(policy.table, owner, {});
			await this.add(change.table, values);
			if (!(policy.table === "experiments" && owner.execution_state === "planned"))
				await this.invalidate({ table: policy.table, key: { id: ownerId } }, "Supporting membership added");
		}
		if (!(policy.table === "experiments" && owner.execution_state === "planned")) this.reason(policy.table);
	}
}

async function experimentTransition(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "experiment" }>,
): Promise<void> {
	const row = await batch.guard(
		{ table: "experiments", id: change.id, revision: change.expectedRevision },
		"experiments",
	);
	requireCondition(["running", "finished", "uncertain"].includes(change.state), "Unsupported experiment state");
	requireCondition(
		row.execution_state !== "finished",
		"Finished execution is immutable; append a correction observation",
	);
	const values: Record<string, InputValue> = { execution_state: change.state };
	const first = row.conditions_frozen_at === null;
	if (first) {
		requireCondition(row.execution_state === "planned", "Invalid unfrozen experiment state");
		requireCondition(
			change.state === "running" || row.recording_mode === "retrospective",
			"Prospective execution must start before completion/reconciliation",
		);
		values.conditions_frozen_at = batch.context.recordedAt;
		requireCondition(
			Boolean(change.executorActorId) === Boolean(change.executorRunId),
			"Executor actor/run must be an attributed pair",
		);
		if (change.executorActorId) {
			values.executor_actor_id = change.executorActorId;
			values.executor_run_id = change.executorRunId!;
		}
		if (change.startedAt !== undefined) values.started_at = change.startedAt;
		else if (row.recording_mode === "prospective" && change.state === "running")
			values.started_at = batch.context.recordedAt;
		if (row.recording_mode === "prospective")
			requireCondition(
				change.executorActorId && change.executorRunId,
				"Prospective execution requires its actual executor",
			);
	} else {
		requireCondition(
			change.executorActorId === undefined && change.executorRunId === undefined && change.startedAt === undefined,
			"Frozen executor/start attribution cannot be rewritten",
		);
		requireCondition(change.state !== row.execution_state, "Execution transition must change state");
	}
	if (change.timeNotes !== undefined)
		values.execution_time_notes = nonempty(change.timeNotes, "Qualified execution times");
	if (change.state === "uncertain")
		values.execution_uncertainty = nonempty(change.uncertainty, "Execution uncertainty");
	if (change.state === "finished") {
		requireCondition(
			(change.finishedAt !== undefined && change.finishedAt !== null) ||
				Boolean(change.timeNotes ?? row.execution_time_notes),
			"Completion needs its known time or explicit unknown-time qualification",
		);
		values.finished_at = change.finishedAt ?? null;
	}
	if (row.execution_state === "uncertain" || change.reconciliation) {
		requireCondition(
			change.reconciliation && change.reconciliation.evidenceIds.length > 0,
			"Reconciliation requires actual discriminating evidence, not an automatic replay",
		);
		values.reconciliation_detail = nonempty(change.reconciliation.detail, "Reconciliation detail");
		for (const evidenceId of new Set(change.reconciliation.evidenceIds))
			await batch.add("experiment_evidence", {
				experiment_id: change.id,
				evidence_id: evidenceId,
				role: "reconciliation",
			});
	}
	if (row.recording_mode === "retrospective" && first)
		requireCondition(
			change.timeNotes || row.execution_time_notes,
			"Retrospective execution requires known/unknown-time provenance",
		);
	await batch.revise("experiments", row, values);
	if (change.state === "finished" || change.state === "uncertain") {
		await batch.invalidate(
			{ table: "experiments", key: { id: change.id } },
			"Execution result/uncertainty requires supporting assessment",
		);
		batch.checkpointReasons.add("experiment_result");
	}
}

async function observation(batch: RecordBatch, change: Extract<HuntChange, { kind: "observation" }>): Promise<void> {
	const experiment = await batch.guard(change.experiment, "experiments");
	requireCondition(
		experiment.conditions_frozen_at !== null,
		"Observation requires recorded frozen conditions; import historical execution explicitly",
	);
	const values = fields(
		change.fields,
		"observed_result measurement tool_transport_failure observation_kind observed_at context supersedes_observation_id",
	);
	requireCondition(
		change.evidenceIds.length > 0 || (values.context !== undefined && values.context !== null),
		"Observation requires evidence or explicit scoped source/context provenance",
	);
	requireCondition(
		(values.observed_result !== undefined && values.observed_result !== null) ||
			(values.measurement !== undefined && values.measurement !== null) ||
			(values.tool_transport_failure !== undefined && values.tool_transport_failure !== null),
		"Observation needs observed content",
	);
	requireCondition(
		values.observation_kind !== "correction" || typeof values.supersedes_observation_id === "string",
		"Correction must name the retained original",
	);
	requireCondition(
		values.supersedes_observation_id === undefined ||
			values.supersedes_observation_id === null ||
			values.observation_kind === "correction",
		"Only a correction supersedes an observation",
	);
	const id = batch.id("observations", change.id);
	await batch.revise("experiments", experiment, {});
	await batch.add("observations", { ...values, id, experiment_id: change.experiment.id });
	for (const evidenceId of new Set(change.evidenceIds))
		await batch.add("observation_evidence", { observation_id: id, evidence_id: evidenceId });
	await batch.invalidate({ table: "observations", key: { id } }, "New retained observation changes available support");
	batch.checkpointReasons.add("experiment_result");
}

async function nextSequence(batch: RecordBatch, table: string, ownerColumn: string, ownerId: string): Promise<string> {
	const rows = await readRows(batch.context.sql, batch.context.catalog, table, { [ownerColumn]: ownerId });
	let maximum = 0n;
	for (const row of rows) {
		const value = BigInt(text(row, "sequence"));
		if (value > maximum) maximum = value;
	}
	return uint((maximum + 1n).toString(), true);
}
async function claim(batch: RecordBatch, change: Extract<HuntChange, { kind: "claim" }>): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	const id = batch.id("finding_claim_revisions", change.id);
	const values = fields(
		change.fields,
		"security_violation mechanism prerequisites reproduction demonstrated_impact conditional_impact claim_gaps",
	);
	requireCondition(Object.keys(values).length > 0, "Empty claim revision");
	await batch.add("finding_claim_revisions", {
		...values,
		id,
		finding_id: change.finding.id,
		sequence: await nextSequence(batch, "finding_claim_revisions", "finding_id", change.finding.id),
		supersedes_claim_revision_id: finding.current_claim_revision_id ?? null,
	});
	for (const edge of change.evidence)
		await batch.add("finding_claim_evidence", {
			finding_claim_revision_id: id,
			evidence_id: edge.evidenceId,
			relationship: edge.relationship,
			detail: edge.detail ?? null,
		});
	await batch.revise("findings", finding, { current_claim_revision_id: id });
	await batch.invalidate(
		{ table: "findings", key: { id: change.finding.id } },
		"Explicitly attribute the actual claim contributors; unknown authorship remains a gap. Independently reassess the changed mechanism/prerequisites/impact",
	);
	batch.checkpointReasons.add("assessment");
}

function currentResultObservations(observations: readonly RawRecordRow[]): RawRecordRow[] {
	// Originals remain in the support/history graph, but a correction replaces their
	// current proof. A current correction can itself contain a directly observed result.
	const superseded = new Set<string>();
	for (const observation of observations)
		if (observation.supersedes_observation_id) superseded.add(observation.supersedes_observation_id);
	return observations.filter(
		observation =>
			!superseded.has(text(observation, "id")) &&
			["result", "correction", "reconciliation"].includes(text(observation, "observation_kind")) &&
			(observation.observed_result !== null || observation.measurement !== null),
	);
}

async function verifyIndependentReproduction(
	batch: RecordBatch,
	verification: Readonly<RawRecordRow>,
	experimentIds: readonly string[],
	evidenceIds: readonly string[],
	contradictionIds: readonly string[],
): Promise<void> {
	const findingId = text(verification, "finding_id");
	const verifier = await batch.get("actors", text(verification, "verifying_actor_id"));
	const verifierRun = await batch.get("runs", text(verification, "verifying_run_id"));
	requireCondition(verifierRun.actor_id === verifier.id, "Verifier actor/run mismatch");
	nonempty(verification.independence_assessment ?? undefined, "Independence assessment");
	nonempty(verification.assessment ?? undefined, "Reproduction assessment");
	const contributors = await readRows(batch.context.sql, batch.context.catalog, "finding_contributors", {
		finding_id: findingId,
	});
	requireCondition(
		contributors.some(
			row =>
				row.actor_id === verification.originating_actor_id &&
				row.run_id === verification.originating_run_id &&
				row.contribution === "originator",
		),
		"Originating actor/run must be a retained finding originator",
	);
	for (const contribution of contributors) {
		const actor = await batch.get("actors", text(contribution, "actor_id"));
		requireCondition(
			actor.id !== verifier.id && actor.external_identity !== verifier.external_identity,
			"Originators/substantial developers, including aliases of the same external identity, cannot independently verify",
		);
	}
	if (verification.outcome !== "confirmed") return;
	requireCondition(!verification.unresolved_disagreements?.trim(), "Disagreements cannot be reported as confirmation");
	requireCondition(
		experimentIds.length > 0 && evidenceIds.length > 0,
		"Confirmation requires independently attributed execution and its evidence",
	);
	const coveredEvidence = new Set<string>();
	for (const experimentId of new Set(experimentIds)) {
		const experiment = await batch.get("experiments", experimentId);
		requireCondition(
			experiment.executor_actor_id === verifier.id &&
				experiment.executor_run_id === verifierRun.id &&
				experiment.execution_state === "finished" &&
				experiment.conditions_frozen_at !== null,
			"Verification requires completed reproduction by the actual verifier/run",
		);
		const investigationLinks = await readRows(batch.context.sql, batch.context.catalog, "finding_investigations", {
			finding_id: findingId,
			investigation_id: text(experiment, "investigation_id"),
		});
		requireCondition(
			investigationLinks.length === 1,
			"Reproduction investigation is not linked to the assessed finding",
		);
		const observations = await readRows(batch.context.sql, batch.context.catalog, "observations", {
			experiment_id: experimentId,
		});
		const currentResults = currentResultObservations(observations);
		requireCondition(
			currentResults.length > 0,
			"Confirmation needs retained current directly observed reproduction results",
		);
		for (const observed of currentResults) {
			for (const edge of await readRows(batch.context.sql, batch.context.catalog, "observation_evidence", {
				observation_id: text(observed, "id"),
			}))
				coveredEvidence.add(text(edge, "evidence_id"));
		}
		for (const edge of await readRows(batch.context.sql, batch.context.catalog, "experiment_evidence", {
			experiment_id: experimentId,
		}))
			if (edge.role === "result") coveredEvidence.add(text(edge, "evidence_id"));
	}
	for (const evidenceId of new Set(evidenceIds)) {
		requireCondition(
			coveredEvidence.has(evidenceId),
			"Verification evidence must actually support its independent reproduction, not merely copy original narrative evidence",
		);
		const evidence = await batch.get("evidence", evidenceId);
		requireCondition(
			evidence.capture_completeness === "complete",
			"Confirmation evidence is missing, truncated, unavailable, or unqualified",
		);
		if (evidence.local_preservation === "preserved") await batch.preserved(evidence);
	}
	for (const contradictionId of contradictionIds)
		requireCondition(
			(await batch.get("contradictions", contradictionId)).state === "resolved",
			"An unresolved contradiction prevents confirmation",
		);
	// These checks reject known disqualifiers. Explicit scientific/independence assessments
	// remain attributed judgments; UUIDs and successful storage do not prove reproduction.
}

async function verification(batch: RecordBatch, change: Extract<HuntChange, { kind: "verification" }>): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	const id = batch.id("verifications", change.id);
	const values: RawRecordRow = {
		id,
		finding_id: change.finding.id,
		assessed_claim_revision_id: change.assessedClaimRevisionId,
		assessed_finding_record_revision: change.finding.revision,
		originating_actor_id: change.originatorActorId,
		originating_run_id: change.originatorRunId,
		verifying_actor_id: change.verifierActorId,
		verifying_run_id: change.verifierRunId,
		independence_assessment: change.independenceAssessment,
		outcome: change.outcome,
		assessment: change.assessment,
		unresolved_disagreements: change.unresolvedDisagreements ?? null,
		supersedes_verification_id: null,
		supersession_rationale: null,
	};
	const assessed = await batch.get("finding_claim_revisions", change.assessedClaimRevisionId);
	requireCondition(assessed.finding_id === finding.id, "Verification claim belongs to another finding");
	validateVerificationRoles(change.experiments, change.evidence, change.outcome);
	const contradictions = new Set(change.contradictionIds);
	if (change.supersedes) {
		const previous = await batch.guard(change.supersedes.verification, "verifications");
		requireCondition(
			previous.finding_id === finding.id &&
				previous.assessed_claim_revision_id === change.assessedClaimRevisionId &&
				previous.id !== id,
			"Supersession must retain the same finding and immutable claim",
		);
		await requireVerificationTip(batch, text(previous, "id"));
		const supersessionEvidence = change.evidence
			.filter(edge => edge.role === "supersession")
			.map(edge => edge.evidenceId);
		await requireDiscriminatingSupersession(batch, previous, supersessionEvidence);
		for (const contradictionId of await verificationContradictions(batch, previous))
			contradictions.add(contradictionId);
		values.unresolved_disagreements = await retainedDisagreements(
			batch,
			previous,
			change.outcome,
			change.unresolvedDisagreements,
			supersessionEvidence,
		);
		values.supersedes_verification_id = text(previous, "id");
		values.supersession_rationale = nonempty(change.supersedes.rationale, "Evidence-backed supersession rationale");
	} else
		requireCondition(
			!change.evidence.some(edge => edge.role === "supersession"),
			"Supersession evidence requires an explicit predecessor",
		);
	await verifyIndependentReproduction(
		batch,
		values,
		change.experiments.filter(edge => edge.role === "assessment").map(edge => edge.experimentId),
		change.evidence.filter(edge => edge.role === "assessment").map(edge => edge.evidenceId),
		[...contradictions],
	);
	await batch.add("verifications", values);
	await addVerificationMemberships(batch, id, change.experiments, change.evidence, contradictions);
	await batch.revise("findings", finding, {});
	await batch.invalidate(
		{ table: "findings", key: { id: change.finding.id } },
		change.assessedClaimRevisionId === finding.current_claim_revision_id
			? `Verification ${change.outcome} recorded; explicitly reassess readiness and gaps`
			: `Historical claim verification ${change.outcome} recorded; current claim coverage is not implied`,
	);
	if (change.outcome === "disputed")
		await batch.revise("findings", await batch.get("findings", change.finding.id), { readiness: "disputed" });
	batch.checkpointReasons.add("assessment");
}

async function findingAssessment(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "finding-assessment" }>,
): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	nonempty(change.assessment, "Current supporting assessment");
	requireCondition(
		["incomplete", "needs_verification", "disputed", "ready"].includes(change.readiness),
		"Invalid readiness",
	);
	if (change.readiness === "ready") {
		requireCondition(/^\s*\[\s*\]\s*$/.test(change.gaps.json), "Ready findings require an explicitly empty gap list");
		const claim = await batch.get("finding_claim_revisions", text(finding, "current_claim_revision_id"));
		for (const field of ["security_violation", "mechanism", "reproduction", "demonstrated_impact"])
			nonempty(claim[field] ?? undefined, `Current claim ${field}`);
		requireCondition(
			claim.prerequisites !== null && claim.prerequisites !== "null",
			"Ready claims require explicit prerequisite knowledge, including an explicit empty list when none apply",
		);
		requireCondition(
			typeof claim.claim_gaps === "string" && /^\s*\[\s*\]\s*$/.test(claim.claim_gaps),
			"Claim gaps are unresolved or unknown",
		);
		const investigations = await readRows(batch.context.sql, batch.context.catalog, "finding_investigations", {
			finding_id: change.finding.id,
		});
		requireCondition(investigations.length > 0, "Ready findings require supporting investigations");
		for (const edge of investigations)
			requireCondition(
				(await batch.get("investigations", text(edge, "investigation_id"))).outcome === "Validated",
				"A linked investigation is not validated",
			);
		await verifyFindingReproducers(batch, change.finding.id);
		const retained = await readRows(batch.context.sql, batch.context.catalog, "verifications", {
			finding_id: change.finding.id,
			assessed_claim_revision_id: text(claim, "id"),
		});
		const superseded = new Set(
			retained.map(row => row.supersedes_verification_id).filter((id): id is string => typeof id === "string"),
		);
		const verifications = retained.filter(row => !superseded.has(text(row, "id")));
		requireCondition(
			verifications.some(row => row.outcome === "confirmed"),
			"Current claim has no unsuperseded independent confirmation",
		);
		requireCondition(
			verifications.every(row => row.outcome === "confirmed"),
			"An unsuperseded pending, failed, inconclusive, or disputed assessment remains a readiness gap",
		);
		for (const verified of verifications) {
			const experiments = await readRows(batch.context.sql, batch.context.catalog, "verification_experiments", {
				verification_id: text(verified, "id"),
				role: "assessment",
			});
			const evidence = await readRows(batch.context.sql, batch.context.catalog, "verification_evidence", {
				verification_id: text(verified, "id"),
				role: "assessment",
			});
			const contradictions = await verificationContradictions(batch, verified);
			await verifyIndependentReproduction(
				batch,
				verified,
				experiments.map(row => text(row, "experiment_id")),
				evidence.map(row => text(row, "evidence_id")),
				[...contradictions],
			);
		}
		const support = await supportSnapshot(batch.context, change.finding.id);
		for (const row of support)
			if (row.table === "contradictions") {
				const state = row.columns.state;
				requireCondition(
					state?.kind === "scalar" && state.value === "resolved",
					"An unresolved material contradiction remains a readiness gap",
				);
			}
		// A fresh explicit assessment is required after support invalidation; no metadata
		// revision, checkpoint acknowledgement, or historical verification auto-promotes it.
	}
	await batch.revise("findings", finding, {
		assessment: change.assessment,
		readiness: change.readiness,
		readiness_gaps: change.gaps,
		support_revision: next(text(finding, "support_revision")),
		report_state: finding.current_report_revision_id ? "stale" : "missing",
		report_staleness_reason: finding.current_report_revision_id ? "Supporting assessment changed" : null,
		export_state: staleExportState(finding),
	});
	batch.checkpointReasons.add("assessment");
}

const contradictionReferenceColumns: Readonly<Record<string, string>> = {
	engagements: "engagement_id",
	surfaces: "surface_id",
	target_models: "target_model_id",
	target_model_claims: "target_model_claim_id",
	approach_families: "approach_family_id",
	investigations: "investigation_id",
	investigation_propositions: "proposition_id",
	experiments: "experiment_id",
	observations: "observation_id",
	evidence: "evidence_id",
	research_sources: "research_source_id",
	findings: "finding_id",
	finding_claim_revisions: "finding_claim_revision_id",
	verifications: "verification_id",
	report_revisions: "report_revision_id",
	caido_links: "caido_link_id",
	sync_attempts: "sync_attempt_id",
};
async function contradiction(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "contradiction" }>,
): Promise<void> {
	requireCondition(change.claims.length >= 2, "Contradiction requires retained competing claim snapshots");
	const id = batch.id("contradictions", change.id);
	await batch.add("contradictions", {
		id,
		original_conflict: nonempty(change.conflict, "Original conflict"),
		context_differences: change.context ?? null,
		state: "open",
		next_discriminating_action: nonempty(change.nextAction, "Next discriminating action"),
	});
	for (const claim of change.claims) {
		const values: Record<string, InputValue> = {
			id: batch.id("contradiction_claims"),
			contradiction_id: id,
			claim_snapshot: nonempty(claim.snapshot, "Conflicting claim snapshot"),
			context_snapshot: claim.context ?? null,
		};
		if (claim.reference) {
			const column = contradictionReferenceColumns[claim.reference.table];
			requireCondition(column, "Unsupported contradiction reference");
			const original = await batch.get(claim.reference.table, claim.reference.id);
			if (claim.reference.revision !== undefined)
				requireCondition(
					original.revision === claim.reference.revision,
					"Contradiction snapshot must name the observed revision",
				);
			values[column] = claim.reference.id;
			values.referenced_record_revision = original.revision ?? null;
		}
		await batch.add("contradiction_claims", values);
	}
	for (const edge of change.evidence)
		await batch.add("contradiction_evidence", {
			contradiction_id: id,
			evidence_id: edge.evidenceId,
			role: edge.role,
		});
	// Conflict references point forward to affected records; propagate each side explicitly.
	for (const claim of change.claims)
		if (claim.reference)
			await batch.invalidate(
				{ table: claim.reference.table, key: { id: claim.reference.id } },
				"Unresolved material contradiction",
				claim.reference.table === "engagements",
			);
	batch.checkpointReasons.add("assessment");
}
async function contradictionEvent(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "contradiction-event" }>,
): Promise<void> {
	const conflict = await batch.guard(change.contradiction, "contradictions");
	requireCondition(
		["open", "resolved"].includes(change.state) && conflict.state !== change.state,
		"Resolution/reopening must change state",
	);
	requireCondition(change.evidenceIds.length > 0, "Resolution/reopening requires discriminating evidence");
	const id = batch.id("contradiction_events", change.id);
	await batch.add("contradiction_events", {
		id,
		contradiction_id: change.contradiction.id,
		sequence: await nextSequence(batch, "contradiction_events", "contradiction_id", change.contradiction.id),
		resulting_state: change.state,
		rationale: nonempty(change.rationale, "Discriminating rationale"),
		context: change.context ?? null,
		occurred_at: change.occurredAt ?? null,
	});
	for (const evidenceId of new Set(change.evidenceIds))
		await batch.add("contradiction_event_evidence", { contradiction_event_id: id, evidence_id: evidenceId });
	await batch.revise("contradictions", conflict, {
		current_event_id: id,
		state: change.state,
		next_discriminating_action:
			change.state === "open"
				? nonempty(change.nextAction, "Next discriminating action")
				: (change.nextAction ?? null),
	});
	const claims = await readRows(batch.context.sql, batch.context.catalog, "contradiction_claims", {
		contradiction_id: change.contradiction.id,
	});
	for (const claim of claims)
		for (const [table, column] of Object.entries(contradictionReferenceColumns))
			if (claim[column])
				await batch.invalidate(
					{ table, key: { id: text(claim, column) } },
					"Contradiction resolution/reopening changes supporting assessment",
					table === "engagements",
				);
	await batch.invalidate(
		{ table: "contradictions", key: { id: change.contradiction.id } },
		"Verification contradiction state changed",
	);
	batch.checkpointReasons.add("assessment");
}

async function supportSnapshot(context: RecordReadContext, findingId: string, asOf?: string): Promise<CanonicalRow[]> {
	const queue: RowLocator[] = [{ table: "findings", key: { id: findingId } }];
	const result = new Map<string, CanonicalRow>();
	while (queue.length) {
		context.signal?.throwIfAborted();
		const locator = queue.shift()!;
		const token = locatorToken(locator);
		if (result.has(token)) continue;
		requireCondition(result.size < 10000, "Supporting graph exceeds bounded operation size");
		const row = await mustRead(context, locator.table, locator.key, asOf);
		if (locator.table === "experiments" && row.execution_state === "planned") continue;
		const snapshot = canonicalRow(context.catalog, locator.table, row);
		if (locator.table === "findings") {
			// These fields are bookkeeping, not a semantic support revision. In particular a
			// report must not require its own current-report pointer in its earlier checkpoint.
			const columns = { ...snapshot.columns };
			for (const column of [
				"revision",
				"updated_at",
				"report_state",
				"report_staleness_reason",
				"export_state",
				"current_report_revision_id",
				"last_exported_report_revision_id",
				"last_exported_file_sha256",
				"last_exported_at",
			])
				delete columns[column];
			result.set(token, { ...snapshot, columns });
		} else result.set(token, snapshot);
		const metadata = tableMetadata(context.catalog, locator.table);
		for (const foreign of metadata.foreignKeys) {
			if (
				Object.hasOwn(administrative, foreign.referencedTable) ||
				foreign.columns.some(column => Object.hasOwn(provenanceColumns, column))
			)
				continue;
			const filter: Record<string, string> = {};
			let present = true;
			for (let index = 0; index < foreign.columns.length; index++) {
				const value = row[foreign.columns[index]!];
				if (value === null || value === undefined) {
					present = false;
					break;
				}
				filter[foreign.referencedColumns[index]!] = value;
			}
			if (!present) continue;
			const references = await readRows(context.sql, context.catalog, foreign.referencedTable, filter, {
				asOf,
				limit: 2,
			});
			requireCondition(references.length === 1, "Supporting reference is missing at the requested checkpoint");
			queue.push({
				table: foreign.referencedTable,
				key: rowKey(context.catalog, foreign.referencedTable, references[0]!),
			});
		}
		for (const [childTable, owner] of Object.entries(owners)) {
			if (
				owner.table !== locator.table ||
				Object.hasOwn(administrative, childTable) ||
				childTable === "finding_claim_revisions"
			)
				continue;
			const children = await readRows(
				context.sql,
				context.catalog,
				childTable,
				{ [owner.column]: text(row, "id") },
				{ asOf, limit: 10001 },
			);
			requireCondition(children.length <= 10000, "Supporting child set exceeds operation bound");
			for (const child of children)
				queue.push({ table: childTable, key: rowKey(context.catalog, childTable, child) });
		}
		const conflictReferences: { column: string; id: string }[] = [];
		const conflictColumn = contradictionReferenceColumns[locator.table];
		if (conflictColumn && row.id) conflictReferences.push({ column: conflictColumn, id: text(row, "id") });
		if (locator.table === "findings") {
			// Report bodies/pointers stay administrative: including them would make a
			// report depend on itself. Their retained conflicts are scientific support.
			const reports = await readRows(
				context.sql,
				context.catalog,
				"report_revisions",
				{ finding_id: text(row, "id") },
				{ asOf, limit: 10001 },
			);
			requireCondition(reports.length <= 10000, "Report revision set exceeds operation bound");
			for (const report of reports)
				conflictReferences.push({
					column: contradictionReferenceColumns.report_revisions!,
					id: text(report, "id"),
				});
		}
		for (const reference of conflictReferences) {
			const conflicts = await readRows(
				context.sql,
				context.catalog,
				"contradiction_claims",
				{ [reference.column]: reference.id },
				{ asOf, limit: 10001 },
			);
			requireCondition(conflicts.length <= 10000, "Supporting contradiction set exceeds operation bound");
			for (const conflict of conflicts)
				queue.push({ table: "contradiction_claims", key: { id: text(conflict, "id") } });
		}
	}
	return [...result.entries()]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([, row]) => row);
}
async function report(batch: RecordBatch, change: Extract<HuntChange, { kind: "report" }>): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	requireCondition(finding.current_claim_revision_id, "A report requires an immutable current claim revision");
	await verifyFindingReproducers(batch, change.finding.id);
	await confirmCheckpoint(batch.context, change.supportingCheckpointHash);
	const current = await supportSnapshot(batch.context, change.finding.id);
	const historical = await supportSnapshot(batch.context, change.finding.id, change.supportingCheckpointHash);
	requireCondition(
		digest(current) === digest(historical),
		"Supporting graph/revisions differ from the actual supporting-data checkpoint",
	);
	const supportEvidence = new Set(current.filter(row => row.table === "evidence").map(row => row.key.id));
	for (const edge of change.evidence) {
		requireCondition(supportEvidence.has(edge.evidenceId), "Report evidence is not in its checked supporting graph");
		await batch.preserved(await batch.get("evidence", edge.evidenceId));
	}
	const id = batch.id("report_revisions", change.id);
	await batch.add("report_revisions", {
		id,
		finding_id: change.finding.id,
		claim_revision_id: text(finding, "current_claim_revision_id"),
		support_revision: text(finding, "support_revision"),
		sequence: await nextSequence(batch, "report_revisions", "finding_id", change.finding.id),
		title: nonempty(change.title, "Report title"),
		body: nonempty(change.body, "Report body"),
		owned_fields_sha256: ownedFieldsHash(change.title, change.body),
		supporting_checkpoint_hash: change.supportingCheckpointHash,
		supersedes_report_revision_id: finding.current_report_revision_id ?? null,
	});
	for (const edge of change.evidence)
		await batch.add("report_revision_evidence", {
			report_revision_id: id,
			evidence_id: edge.evidenceId,
			role: edge.role ?? null,
		});
	await batch.revise("findings", finding, {
		current_report_revision_id: id,
		report_state: "current",
		report_staleness_reason: null,
		export_state: staleExportState(finding),
	});
	batch.checkpointReasons.add("report");
}
async function inspectReportCheckpoint(
	context: RecordReadContext,
	findingId: string,
	reportId: string,
	hash: string,
): Promise<RawRecordRow> {
	await confirmCheckpoint(context, hash);
	const report = await mustRead(context, "report_revisions", { id: reportId });
	requireCondition(report.finding_id === findingId, "Report belongs to another finding");
	const historical = await readCanonicalRow(context.sql, context.catalog, "report_revisions", { id: reportId }, hash);
	requireCondition(
		historical &&
			hashCanonicalRow(historical) === hashCanonicalRow(canonicalRow(context.catalog, "report_revisions", report)),
		"Confirmed checkpoint does not contain the exact immutable report",
	);
	const evidence = await readRows(context.sql, context.catalog, "report_revision_evidence", {
		report_revision_id: reportId,
	});
	const oldEvidence = await readRows(
		context.sql,
		context.catalog,
		"report_revision_evidence",
		{ report_revision_id: reportId },
		{ asOf: hash },
	);
	requireCondition(
		digest(evidence.map(row => canonicalRow(context.catalog, "report_revision_evidence", row))) ===
			digest(oldEvidence.map(row => canonicalRow(context.catalog, "report_revision_evidence", row))),
		"Report-containing checkpoint has a different frozen evidence set",
	);
	return report;
}
async function reportCheckpoint(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "report-checkpoint" }>,
): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	await inspectReportCheckpoint(batch.context, change.finding.id, change.reportRevisionId, change.checkpointHash);
	await batch.add("report_checkpoints", {
		finding_id: change.finding.id,
		report_revision_id: change.reportRevisionId,
		checkpoint_hash: change.checkpointHash,
	});
	await batch.revise("findings", finding, {});
	// Administrative acknowledgement deliberately does not advance support or readiness.
}
async function caidoProject(batch: RecordBatch, id: string): Promise<RawRecordRow> {
	const project = await batch.get("native_projects", id);
	requireCondition(
		project.tool_name === "caido" && project.engagement_id === batch.context.engagementId,
		"Expected this engagement's explicit Caido instance/project",
	);
	return project;
}
async function caidoLink(batch: RecordBatch, change: Extract<HuntChange, { kind: "caido-link" }>): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	await caidoProject(batch, change.nativeProjectId);
	if (change.nativeFindingId) {
		requireCondition(
			change.associationEvidenceId,
			"Explicit existing native finding adoption requires retained association evidence",
		);
		const references = await readRows(batch.context.sql, batch.context.catalog, "evidence_native_references", {
			evidence_id: change.associationEvidenceId,
			native_project_id: change.nativeProjectId,
			object_kind: "finding",
			native_object_id: change.nativeFindingId,
		});
		requireCondition(
			references.length > 0,
			"Association evidence does not identify the explicit native finding/project",
		);
		const links = await readRows(batch.context.sql, batch.context.catalog, "finding_evidence", {
			finding_id: change.finding.id,
			evidence_id: change.associationEvidenceId,
		});
		requireCondition(links.length > 0, "Native association evidence is not linked to this finding");
	}
	await batch.add("caido_links", {
		id: batch.id("caido_links", change.id),
		finding_id: change.finding.id,
		native_project_id: change.nativeProjectId,
		native_finding_id: change.nativeFindingId ?? null,
		deduplication_identity: `hunt:${batch.context.engagementId}:${change.finding.id}`,
	});
	await batch.revise("findings", finding, {});
	batch.checkpointReasons.add("sync");
}
async function syncIntent(batch: RecordBatch, change: Extract<HuntChange, { kind: "sync-intent" }>): Promise<void> {
	const link = await batch.guard(change.link, "caido_links");
	await caidoProject(batch, text(link, "native_project_id"));
	const finding = await batch.get("findings", text(link, "finding_id"));
	const report = await inspectReportCheckpoint(
		batch.context,
		text(finding, "id"),
		change.reportRevisionId,
		change.checkpointHash,
	);
	await mustRead(batch.context, "report_checkpoints", {
		finding_id: text(finding, "id"),
		report_revision_id: change.reportRevisionId,
		checkpoint_hash: change.checkpointHash,
	});
	requireCondition(
		finding.current_report_revision_id === report.id && finding.report_state === "current",
		"Only an explicitly current, nonstale report can become a new sync intent",
	);
	const attempts = await readRows(batch.context.sql, batch.context.catalog, "sync_attempts", {
		caido_link_id: change.link.id,
	});
	requireCondition(
		!attempts.some(attempt => attempt.result === "prepared" || attempt.result === "uncertain"),
		"An unresolved native intent must be reconciled before preparing another",
	);
	requireCondition(
		change.previousRemoteState === "absent" || change.previousRemoteState === "present",
		"Intent requires observed prior remote state",
	);
	if (change.operation === "create") {
		requireCondition(
			link.native_finding_id === null &&
				change.previousRemoteState === "absent" &&
				change.creationRequestReferenceId,
			"Creation requires an unbound link, observed absence, and a genuine request association",
		);
		const reference = await batch.get("evidence_native_references", change.creationRequestReferenceId);
		requireCondition(
			reference.native_project_id === link.native_project_id &&
				reference.object_kind === "request" &&
				Boolean(reference.native_object_id),
			"Creation association must identify a Caido request in the intended project",
		);
		const support = await supportSnapshot(batch.context, text(finding, "id"));
		requireCondition(
			support.some(row => row.table === "evidence" && row.key.id === reference.evidence_id),
			"Creation request evidence is unrelated to this finding's actual supporting context",
		);
		const evidence = await batch.get("evidence", text(reference, "evidence_id"));
		requireCondition(
			evidence.capture_completeness !== "missing" && evidence.capture_completeness !== "unavailable",
			"Creation request association is unavailable",
		);
	} else {
		requireCondition(
			change.operation === "update" && link.native_finding_id && change.previousRemoteState === "present",
			"Update requires the existing explicit native target",
		);
		requireCondition(
			change.previousRemoteOwnedFieldsSha256 === link.last_synced_owned_fields_sha256 ||
				change.previousRemoteOwnedFieldsSha256 === report.owned_fields_sha256,
			"Remote divergence requires reconciliation; it cannot be silently overwritten",
		);
	}
	const operation = await batch.get("persistence_operations", batch.context.operationId);
	requireCondition(
		operation.engagement_id === batch.context.engagementId && operation.operation_kind === "sync",
		"Sync intent requires its parent's explicit sync operation",
	);
	await batch.add("sync_attempts", {
		id: batch.id("sync_attempts", change.id),
		operation_id: batch.context.operationId,
		finding_id: text(finding, "id"),
		caido_link_id: change.link.id,
		native_project_id: text(link, "native_project_id"),
		creation_request_reference_id: change.creationRequestReferenceId ?? null,
		intended_report_revision_id: change.reportRevisionId,
		intended_checkpoint_hash: change.checkpointHash,
		intended_owned_fields_sha256: text(report, "owned_fields_sha256"),
		previous_remote_state: change.previousRemoteState,
		previous_remote_owned_fields_sha256: change.previousRemoteOwnedFieldsSha256 ?? null,
		target_native_finding_id: change.operation === "update" ? text(link, "native_finding_id") : null,
		operation: change.operation,
		result: "prepared",
		prepared_at: batch.context.recordedAt,
	});
	await batch.revise("caido_links", link, {});
	batch.checkpointReasons.add("sync");
}
async function syncOutcome(batch: RecordBatch, change: Extract<HuntChange, { kind: "sync-outcome" }>): Promise<void> {
	const attempt = await batch.guard(change.attempt, "sync_attempts");
	const link = await batch.guard(change.link, "caido_links", text(attempt, "caido_link_id"));
	requireCondition(attempt.result !== "succeeded", "Confirmed native outcome is historical and cannot be rewritten");
	requireCondition(["uncertain", "succeeded", "conflict", "failed"].includes(change.result), "Unknown native outcome");
	const values: Record<string, InputValue> = { result: change.result };
	if (change.dispatchedAt !== undefined) {
		requireCondition(
			attempt.dispatched_at === null || attempt.dispatched_at === change.dispatchedAt,
			"Known dispatch timestamp is immutable",
		);
		values.dispatched_at = change.dispatchedAt;
	}
	if (change.finishedAt !== undefined) values.finished_at = change.finishedAt;
	if (change.reconciledAt !== undefined) values.reconciled_at = change.reconciledAt;
	if (change.returnedNativeFindingId !== undefined) {
		requireCondition(
			attempt.returned_native_finding_id === null ||
				attempt.returned_native_finding_id === change.returnedNativeFindingId,
			"A known returned native finding ID cannot be replaced; retain and reconcile conflicting candidates",
		);
		values.returned_native_finding_id = change.returnedNativeFindingId;
	}
	if (change.observedOwnedFieldsSha256 !== undefined)
		values.observed_owned_fields_sha256 = change.observedOwnedFieldsSha256;
	values[
		change.result === "conflict"
			? "conflict_detail"
			: change.result === "uncertain"
				? "uncertainty_detail"
				: "error_detail"
	] = nonempty(change.detail, "Native result detail");
	let confirmedNativeId: string | null = null;
	let observedAt: string | null = null;
	if (change.result === "succeeded") {
		const observations = (batch.context.nativeReadbacks ?? []).filter(
			readback => readback.attemptId === change.attempt.id,
		);
		requireCondition(
			observations.length === 1,
			"Success requires actual native readback from the trusted adapter, never a model assertion",
		);
		const readback = observations[0]!;
		const project = await caidoProject(batch, text(attempt, "native_project_id"));
		utc(readback.observedAt);
		requireCondition(
			readback.nativeProjectId === project.id &&
				readback.instanceId === project.instance_id &&
				readback.projectId === project.project_id,
			"Readback native context differs from frozen intent",
		);
		requireCondition(
			readback.observedAt >= text(attempt, "prepared_at") && readback.observedAt <= batch.context.recordedAt,
			"Readback time is outside the recorded intent/observation interval",
		);
		const expectedNativeId =
			attempt.operation === "update"
				? text(attempt, "target_native_finding_id")
				: (change.returnedNativeFindingId ?? attempt.returned_native_finding_id);
		requireCondition(
			expectedNativeId && readback.nativeFindingId === expectedNativeId,
			"Readback does not identify the intended/returned native finding",
		);
		const observedHash = ownedFieldsHash(readback.title, readback.description);
		requireCondition(
			observedHash === attempt.intended_owned_fields_sha256,
			"Native readback differs from intended title/description",
		);
		const report = await batch.get("report_revisions", text(attempt, "intended_report_revision_id"));
		requireCondition(
			readback.title === report.title && readback.description === report.body,
			"Native content differs from canonical immutable report",
		);
		values.observed_owned_fields_sha256 = observedHash;
		values.finished_at = readback.observedAt;
		values.reconciled_at = readback.observedAt;
		values.error_detail = null;
		if (attempt.operation === "create") values.returned_native_finding_id = expectedNativeId;
		confirmedNativeId = expectedNativeId;
		observedAt = readback.observedAt;
	}
	await batch.revise("sync_attempts", attempt, values);
	const linkValues: Record<string, InputValue> = {};
	if (confirmedNativeId) {
		requireCondition(
			link.native_finding_id === null || link.native_finding_id === confirmedNativeId,
			"Confirmation cannot retarget a newer link",
		);
		linkValues.native_finding_id = confirmedNativeId;
		const report = await batch.get("report_revisions", text(attempt, "intended_report_revision_id"));
		const last = link.last_synced_report_revision_id
			? await batch.get("report_revisions", link.last_synced_report_revision_id)
			: null;
		if (
			!last ||
			BigInt(text(report, "sequence")) > BigInt(text(last, "sequence")) ||
			(report.id === last.id &&
				observedAt !== null &&
				(link.last_synced_at === null || observedAt >= text(link, "last_synced_at")))
		) {
			linkValues.last_synced_report_revision_id = text(report, "id");
			linkValues.last_synced_checkpoint_hash = text(attempt, "intended_checkpoint_hash");
			linkValues.last_synced_owned_fields_sha256 = text(attempt, "intended_owned_fields_sha256");
			linkValues.last_synced_at = observedAt;
		}
	}
	await batch.revise("caido_links", link, linkValues);
	batch.checkpointReasons.add("sync");
}
async function exportIntent(batch: RecordBatch, change: Extract<HuntChange, { kind: "export-intent" }>): Promise<void> {
	const finding = await batch.guard(change.finding, "findings");
	const report = await batch.get("report_revisions", change.reportRevisionId);
	requireCondition(
		report.finding_id === finding.id &&
			finding.current_report_revision_id === report.id &&
			finding.report_state === "current",
		"Export intent requires this finding's current nonstale report",
	);
	requireCondition(
		reportExportSha256(text(report, "title"), text(report, "body")) === change.intendedFileSha256,
		"Export intent hash must be the exact canonical report-file bytes",
	);
	const attempts = await readRows(batch.context.sql, batch.context.catalog, "export_attempts", {
		finding_id: change.finding.id,
	});
	requireCondition(
		!attempts.some(row => row.result === "prepared" || row.result === "uncertain"),
		"Unresolved export intent requires reconciliation first",
	);
	const operation = await batch.get("persistence_operations", batch.context.operationId);
	requireCondition(
		operation.operation_kind === "export" && operation.engagement_id === batch.context.engagementId,
		"Export intent requires its parent's export operation",
	);
	await batch.add("export_attempts", {
		id: batch.id("export_attempts", change.id),
		operation_id: batch.context.operationId,
		finding_id: change.finding.id,
		intended_report_revision_id: change.reportRevisionId,
		intended_file_sha256: change.intendedFileSha256,
		previous_file_state: change.previousFileState,
		previous_file_sha256: change.previousFileSha256 ?? null,
		result: "prepared",
		started_at: batch.context.recordedAt,
	});
	await batch.revise("findings", finding, {});
}
async function exportOutcome(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "export-outcome" }>,
): Promise<void> {
	const attempt = await batch.guard(change.attempt, "export_attempts");
	const finding = await batch.guard(change.finding, "findings", text(attempt, "finding_id"));
	requireCondition(attempt.result !== "succeeded", "Confirmed export is historical and cannot be rewritten");
	requireCondition(["uncertain", "succeeded", "conflict", "failed"].includes(change.result), "Unknown export result");
	const values: Record<string, InputValue> = {
		result: change.result,
		detail: nonempty(change.detail, "Export outcome detail"),
		finished_at: change.result === "uncertain" ? null : batch.context.recordedAt,
	};
	const findingValues: Record<string, InputValue> = {};
	if (change.result === "succeeded") {
		const report = await batch.get("report_revisions", text(attempt, "intended_report_revision_id"));
		await verifyReportExport(
			batch.context.engagementRoot,
			change.finding.id,
			text(report, "title"),
			text(report, "body"),
			text(attempt, "intended_file_sha256"),
		);
		values.observed_file_sha256 = text(attempt, "intended_file_sha256");
		const previous = finding.last_exported_report_revision_id
			? await batch.get("report_revisions", finding.last_exported_report_revision_id)
			: null;
		if (!previous || BigInt(text(report, "sequence")) >= BigInt(text(previous, "sequence"))) {
			findingValues.last_exported_report_revision_id = text(report, "id");
			findingValues.last_exported_file_sha256 = text(attempt, "intended_file_sha256");
			findingValues.last_exported_at = batch.context.recordedAt;
			findingValues.export_state =
				finding.current_report_revision_id === report.id && finding.report_state === "current"
					? "current"
					: "stale";
		} else if (finding.current_report_revision_id !== report.id) findingValues.export_state = "stale";
	} else if (attempt.intended_report_revision_id === finding.current_report_revision_id) {
		const attempts = await readRows(batch.context.sql, batch.context.catalog, "export_attempts", {
			finding_id: change.finding.id,
		});
		const newerOrAmbiguous = attempts.some(
			other =>
				other.id !== attempt.id &&
				(text(other, "started_at") >= text(attempt, "started_at") ||
					(other.result === "succeeded" &&
						other.finished_at !== null &&
						other.finished_at! >= text(attempt, "started_at"))),
		);
		// An old acknowledgement is historical, not a fresh observation of current bytes.
		if (!newerOrAmbiguous)
			findingValues.export_state =
				change.result === "failed"
					? finding.last_exported_report_revision_id
						? "stale"
						: "missing"
					: change.result;
	}
	await batch.revise("export_attempts", attempt, values);
	await batch.revise("findings", finding, findingValues);
}

export async function applyRecordChanges(
	context: RecordWriteContext,
	changes: readonly HuntChange[],
): Promise<ApplyRecordReceipt> {
	context.signal?.throwIfAborted();
	uuid(context.engagementId);
	uuid(context.operationId);
	uuid(context.recorderActorId);
	uuid(context.recorderRunId);
	utc(context.recordedAt);
	requireVerificationSchema(context.catalog);
	requireCondition(changes.length > 0 && changes.length <= 250, "A coherent batch must contain 1–250 changes");
	const recorder = await mustRead(context, "runs", { id: context.recorderRunId });
	requireCondition(recorder.actor_id === context.recorderActorId, "Trusted recorder actor/run mismatch");
	if (!changes.some(change => change.kind === "create" && change.table === "engagements"))
		await validateReadContext(context);
	const batch = new RecordBatch(context);
	for (const [index, change] of changes.entries()) {
		batch.changeIndex = index;
		context.signal?.throwIfAborted();
		switch (change.kind) {
			case "create":
				await batch.create(change);
				break;
			case "edit":
				await batch.edit(change);
				break;
			case "relation":
				await batch.relation(change);
				break;
			case "experiment":
				await experimentTransition(batch, change);
				break;
			case "observation":
				await observation(batch, change);
				break;
			case "claim":
				await claim(batch, change);
				break;
			case "verification":
				await verification(batch, change);
				break;
			case "verification-result":
				await verificationResult(batch, change);
				break;
			case "finding-assessment":
				await findingAssessment(batch, change);
				break;
			case "contradiction":
				await contradiction(batch, change);
				break;
			case "contradiction-event":
				await contradictionEvent(batch, change);
				break;
			case "report":
				await report(batch, change);
				break;
			case "report-checkpoint":
				await reportCheckpoint(batch, change);
				break;
			case "caido-link":
				await caidoLink(batch, change);
				break;
			case "sync-intent":
				await syncIntent(batch, change);
				break;
			case "sync-outcome":
				await syncOutcome(batch, change);
				break;
			case "export-intent":
				await exportIntent(batch, change);
				break;
			case "export-outcome":
				await exportOutcome(batch, change);
				break;
			default:
				throw new RecordError("invalid_input", "Unsupported lifecycle mutation");
		}
	}
	const rows: RowReceipt[] = [];
	for (const locator of [...batch.affected.values()].sort((left, right) =>
		locatorToken(left).localeCompare(locatorToken(right), "en"),
	)) {
		const raw = await readRow(context.sql, context.catalog, locator.table, locator.key);
		if (raw) await validateFinalRecord(batch, locator.table, raw);
		const poststate = raw ? canonicalRow(context.catalog, locator.table, raw) : null;
		rows.push({
			...locator,
			revision: raw?.revision ?? null,
			poststate,
			poststateSha256: hashCanonicalRow(poststate),
		});
	}
	// No COMMIT here. Any rejection requires the parent to roll back the entire batch.
	return {
		format: "hunt-record-receipt-v1",
		operationId: context.operationId,
		generatedIds: batch.generatedIds,
		rows,
		checkpointReasons: [...batch.checkpointReasons],
	};
}

export async function inspectRecords(
	context: RecordReadContext,
	request: InspectRecordsRequest,
): Promise<InspectRecordsResult> {
	context.signal?.throwIfAborted();
	if (request.asOf) await confirmCheckpoint(context, request.asOf);
	else await validateReadContext(context);
	const view = request.asOf ? { kind: "checkpoint" as const, hash: request.asOf } : { kind: "working" as const };
	if (request.kind === "get") {
		const row = await mustRead(context, request.locator.table, request.locator.key, request.asOf);
		return {
			format: "hunt-record-inspection-v1",
			view,
			rows: [canonicalRow(context.catalog, request.locator.table, row)],
			next: null,
			empty: false,
		};
	}
	requireCondition(
		Number.isInteger(request.limit) && request.limit >= 1 && request.limit <= 200,
		"Inspection limit must be 1–200",
	);
	let table: string;
	let where: RowKey;
	if (request.kind === "list") {
		table = request.table;
		where = request.where ?? {};
	} else {
		requireCondition(request.kind === "relationships", "Unknown inspection request");
		const source = await mustRead(context, request.locator.table, request.locator.key, request.asOf);
		table = request.relatedTable;
		const foreignOwner =
			request.direction === "outgoing"
				? tableMetadata(context.catalog, request.locator.table)
				: tableMetadata(context.catalog, table);
		const foreign = foreignOwner.foreignKeys.find(key => key.name === request.foreignKey);
		requireCondition(foreign, "Unknown relationship foreign key");
		requireCondition(
			request.direction === "outgoing"
				? foreign.referencedTable === table
				: foreign.referencedTable === request.locator.table,
			"Relationship direction/table mismatch",
		);
		const filter: Record<string, string> = {};
		for (let index = 0; index < foreign.columns.length; index++) {
			const sourceColumn =
				request.direction === "outgoing" ? foreign.columns[index]! : foreign.referencedColumns[index]!;
			const targetColumn =
				request.direction === "outgoing" ? foreign.referencedColumns[index]! : foreign.columns[index]!;
			const value = source[sourceColumn];
			if (value === null) return { format: "hunt-record-inspection-v1", view, rows: [], next: null, empty: true };
			requireCondition(typeof value === "string", "Relationship source state is incomplete");
			filter[targetColumn] = value;
		}
		where = filter;
	}
	const records = await readRows(context.sql, context.catalog, table, where, {
		asOf: request.asOf,
		after: request.after,
		limit: request.limit + 1,
	});
	const more = records.length > request.limit;
	const selected = records.slice(0, request.limit);
	return {
		format: "hunt-record-inspection-v1",
		view,
		rows: selected.map(row => canonicalRow(context.catalog, table, row)),
		next: more ? rowKey(context.catalog, table, selected[selected.length - 1]!) : null,
		empty: selected.length === 0,
	};
}

async function verificationResult(
	batch: RecordBatch,
	change: Extract<HuntChange, { kind: "verification-result" }>,
): Promise<void> {
	const verification = await batch.guard(change.verification, "verifications");
	const finding = await batch.guard(change.finding, "findings", text(verification, "finding_id"));
	requireCondition(
		verification.outcome === "pending",
		"Completed assessments are retained; create an explicit superseding verification",
	);
	await requireVerificationTip(batch, change.verification.id);
	requireCondition(
		["confirmed", "failed", "inconclusive", "disputed"].includes(change.outcome),
		"Unsupported verification outcome",
	);
	validateVerificationRoles(change.experiments, change.evidence, change.outcome);
	requireCondition(
		!change.evidence.some(edge => edge.role === "supersession"),
		"Supersession evidence is frozen when a successor is created",
	);
	const previousProof = await readRows(batch.context.sql, batch.context.catalog, "verification_evidence", {
		verification_id: change.verification.id,
		role: "assessment",
	});
	const previousExperiments = await readRows(batch.context.sql, batch.context.catalog, "verification_experiments", {
		verification_id: change.verification.id,
		role: "assessment",
	});
	requireCondition(
		previousProof.length === 0 && previousExperiments.length === 0,
		"Pending assessment already has a proof set; reconcile incompatible state rather than replacing it",
	);
	const contradictions = await verificationContradictions(batch, verification);
	for (const id of change.contradictionIds) contradictions.add(id);
	const proof = change.evidence.filter(edge => edge.role === "assessment").map(edge => edge.evidenceId);
	const supersessionEvidence = await readRows(batch.context.sql, batch.context.catalog, "verification_evidence", {
		verification_id: change.verification.id,
		role: "supersession",
	});
	const disagreements = await retainedDisagreements(
		batch,
		verification,
		change.outcome,
		change.unresolvedDisagreements,
		[...proof, ...supersessionEvidence.map(edge => text(edge, "evidence_id"))],
	);
	const values: RawRecordRow = {
		outcome: change.outcome,
		assessed_finding_record_revision: change.finding.revision,
		independence_assessment: nonempty(change.independenceAssessment, "Independence assessment"),
		assessment: nonempty(change.assessment, "Verification assessment"),
		unresolved_disagreements: disagreements,
	};
	await verifyIndependentReproduction(
		batch,
		{ ...verification, ...values },
		change.experiments.filter(edge => edge.role === "assessment").map(edge => edge.experimentId),
		proof,
		[...contradictions],
	);
	await addVerificationMemberships(batch, change.verification.id, change.experiments, change.evidence, contradictions);
	await batch.revise("verifications", verification, values);
	await batch.revise("findings", finding, {});
	await batch.invalidate(
		{ table: "findings", key: { id: change.finding.id } },
		`Pending verification finalized as ${change.outcome}; explicitly reassess current claim readiness`,
	);
	if (change.outcome === "disputed")
		await batch.revise("findings", await batch.get("findings", change.finding.id), { readiness: "disputed" });
	batch.checkpointReasons.add("assessment");
}

async function validateFinalRecord(batch: RecordBatch, table: string, row: Readonly<RawRecordRow>): Promise<void> {
	if (table === "evidence") {
		if (row.derivation_kind === "derived")
			requireCondition(
				(
					await readRows(batch.context.sql, batch.context.catalog, "evidence_derivations", {
						derived_evidence_id: text(row, "id"),
					})
				).length > 0,
				"Derived evidence needs retained original/transformation provenance in the same coherent batch",
			);
		if (row.local_preservation === "preserved") await batch.preserved(row);
	}
	if (table === "target_model_claims" && (row.claim_kind === "observation" || row.claim_kind === "inference")) {
		const evidence = await readRows(batch.context.sql, batch.context.catalog, "target_model_claim_evidence", {
			target_model_claim_id: text(row, "id"),
		});
		const observations = await readRows(batch.context.sql, batch.context.catalog, "target_model_claim_observations", {
			target_model_claim_id: text(row, "id"),
		});
		requireCondition(
			evidence.length + observations.length > 0,
			"Observed/inferred material model claims need retained supporting or contradicting references; unsupported implementation remains an assumption",
		);
	}
	if (table === "investigations" && row.outcome === "Validated") {
		const experiments = await readRows(batch.context.sql, batch.context.catalog, "experiments", {
			investigation_id: text(row, "id"),
			execution_state: "finished",
		});
		let observed = false;
		for (const experiment of experiments) {
			const results = await readRows(batch.context.sql, batch.context.catalog, "observations", {
				experiment_id: text(experiment, "id"),
			});
			if (currentResultObservations(results).length > 0) observed = true;
		}
		requireCondition(
			observed && row.assessment?.trim(),
			"Validated investigation requires completed target execution, retained direct results, and its explicit assessment",
		);
	}
	if (table === "findings") {
		requireCondition(
			row.report_state === "missing"
				? row.current_report_revision_id === null
				: row.current_report_revision_id !== null,
			"Report state/pointer must agree",
		);
		if (row.report_state === "current") {
			const report = await batch.get("report_revisions", text(row, "current_report_revision_id"));
			requireCondition(
				report.finding_id === row.id &&
					report.claim_revision_id === row.current_claim_revision_id &&
					report.support_revision === row.support_revision,
				"Current report no longer covers the current claim/support revision",
			);
		}
	}
}

function staleExportState(finding: Readonly<RawRecordRow>): string {
	return finding.export_state === "conflict" || finding.export_state === "uncertain"
		? finding.export_state
		: finding.last_exported_report_revision_id
			? "stale"
			: "missing";
}

function requireVerificationSchema(catalog: RecordCatalog): void {
	const verification = tableMetadata(catalog, "verifications");
	requireCondition(
		["supersedes_verification_id", "supersession_rationale"].every(name =>
			verification.columns.some(column => column.name === name),
		),
		"The separately approved verification schema extension is required before record writes",
	);
	for (const table of ["verification_experiments", "verification_evidence"])
		requireCondition(
			tableMetadata(catalog, table).primaryKey.includes("role"),
			"Verification membership roles are not installed",
		);
}
function validateVerificationRoles(
	experiments: readonly VerificationExperimentLink[],
	evidence: readonly VerificationEvidenceLink[],
	outcome: string,
): void {
	for (const edge of experiments)
		requireCondition(edge.role === "assessment" || edge.role === "context", "Unknown verification experiment role");
	for (const edge of evidence)
		requireCondition(
			["assessment", "context", "supersession"].includes(edge.role),
			"Unknown verification evidence role",
		);
	if (outcome === "pending")
		requireCondition(
			experiments.every(edge => edge.role === "context") && evidence.every(edge => edge.role !== "assessment"),
			"Pending verifications retain context, not a completed assessment proof set",
		);
}
async function requireVerificationTip(batch: RecordBatch, id: string): Promise<void> {
	requireCondition(
		(
			await readRows(
				batch.context.sql,
				batch.context.catalog,
				"verifications",
				{ supersedes_verification_id: id },
				{ limit: 1 },
			)
		).length === 0,
		"Verification is already superseded",
	);
}
async function verificationContradictions(
	batch: RecordBatch,
	verification: Readonly<RawRecordRow>,
): Promise<Set<string>> {
	const result = new Set<string>();
	const visited = new Set<string>();
	let current = verification;
	for (;;) {
		const id = text(current, "id");
		requireCondition(!visited.has(id) && visited.size < 10000, "Invalid verification ancestry");
		visited.add(id);
		for (const edge of await readRows(batch.context.sql, batch.context.catalog, "verification_contradictions", {
			verification_id: id,
		}))
			result.add(text(edge, "contradiction_id"));
		for (const side of await readRows(batch.context.sql, batch.context.catalog, "contradiction_claims", {
			verification_id: id,
		}))
			result.add(text(side, "contradiction_id"));
		if (!current.supersedes_verification_id) break;
		current = await batch.get("verifications", current.supersedes_verification_id);
	}
	return result;
}
async function requireDiscriminatingSupersession(
	batch: RecordBatch,
	previous: Readonly<RawRecordRow>,
	evidenceIds: readonly string[],
): Promise<void> {
	requireCondition(
		evidenceIds.length > 0,
		"Supersession requires explicit discriminating evidence, not merely another run ID",
	);
	const retained = new Set<string>();
	const visited = new Set<string>();
	let current = previous;
	for (;;) {
		const id = text(current, "id");
		requireCondition(!visited.has(id) && visited.size < 10000, "Invalid verification ancestry");
		visited.add(id);
		for (const edge of await readRows(batch.context.sql, batch.context.catalog, "verification_evidence", {
			verification_id: id,
		}))
			retained.add(text(edge, "evidence_id"));
		if (!current.supersedes_verification_id) break;
		current = await batch.get("verifications", current.supersedes_verification_id);
	}
	const retainedSources = new Set<string>();
	for (const id of retained)
		for (const source of await evidenceSourceIdentities(batch, await batch.get("evidence", id)))
			retainedSources.add(source);
	for (const id of new Set(evidenceIds)) {
		requireCondition(
			!retained.has(id),
			"Supersession must introduce discriminating evidence not already retained by the predecessor chain",
		);
		const evidence = await batch.get("evidence", id);
		requireCondition(evidence.capture_completeness === "complete", "Supersession evidence must be complete");
		for (const source of await evidenceSourceIdentities(batch, evidence))
			requireCondition(
				!retainedSources.has(source),
				"A new UUID or alternate view of already retained bytes/native capture is not new discriminating evidence",
			);
		const references = await readRows(batch.context.sql, batch.context.catalog, "observation_evidence", {
			evidence_id: id,
		});
		let observed = false;
		for (const reference of references) {
			const observation = await batch.get("observations", text(reference, "observation_id"));
			if (
				["result", "correction", "reconciliation"].includes(text(observation, "observation_kind")) &&
				(observation.observed_result !== null || observation.measurement !== null)
			)
				observed = true;
		}
		requireCondition(
			observed,
			"Supersession requires retained discriminating observations, not narrative endorsement",
		);
		await batch.preserved(evidence);
	}
}
async function retainedDisagreements(
	batch: RecordBatch,
	previous: Readonly<RawRecordRow>,
	outcome: string,
	proposed: string | undefined,
	discriminatingEvidence: readonly string[],
): Promise<string | null> {
	const retained = previous.unresolved_disagreements?.trim();
	if (!retained) return proposed?.trim() || null;
	if (outcome !== "confirmed")
		return proposed?.trim() && proposed.trim() !== retained ? `${retained}\n\n${proposed.trim()}` : retained;
	requireCondition(!proposed?.trim(), "New unresolved disagreements cannot be confirmed");
	const requiredContradictions = new Set<string>();
	const visited = new Set<string>();
	let current = previous;
	while (current.unresolved_disagreements?.trim()) {
		const id = text(current, "id");
		requireCondition(!visited.has(id) && visited.size < 10000, "Invalid verification disagreement ancestry");
		visited.add(id);
		const parent = current.supersedes_verification_id
			? await batch.get("verifications", current.supersedes_verification_id)
			: null;
		// Unchanged inherited text keeps its original disagreement identity. New or
		// expanded disagreement text needs its own explicitly referenced conflict.
		if (!parent || parent.unresolved_disagreements?.trim() !== current.unresolved_disagreements.trim()) {
			const sides = await readRows(batch.context.sql, batch.context.catalog, "contradiction_claims", {
				verification_id: id,
			});
			requireCondition(
				sides.length > 0,
				"Clearing prior disagreements requires retained contradictions referencing the assessments that introduced them",
			);
			for (const side of sides) requiredContradictions.add(text(side, "contradiction_id"));
		}
		if (!parent) break;
		current = parent;
	}
	for (const id of requiredContradictions) {
		const contradiction = await batch.get("contradictions", id);
		requireCondition(
			contradiction.state === "resolved" && contradiction.current_event_id,
			"Prior disagreements remain unresolved",
		);
		const resolutionEvidence = await readRows(
			batch.context.sql,
			batch.context.catalog,
			"contradiction_event_evidence",
			{ contradiction_event_id: text(contradiction, "current_event_id") },
		);
		requireCondition(
			resolutionEvidence.some(edge => discriminatingEvidence.includes(text(edge, "evidence_id"))),
			"Disagreement resolution must use the assessment/supersession's discriminating evidence",
		);
	}
	return null;
}
async function addVerificationMemberships(
	batch: RecordBatch,
	id: string,
	experiments: readonly VerificationExperimentLink[],
	evidence: readonly VerificationEvidenceLink[],
	contradictions: ReadonlySet<string>,
): Promise<void> {
	for (const edge of experiments) {
		const key = { verification_id: id, experiment_id: edge.experimentId, role: edge.role };
		if (!(await readRow(batch.context.sql, batch.context.catalog, "verification_experiments", key)))
			await batch.add("verification_experiments", key);
	}
	for (const edge of evidence) {
		const key = { verification_id: id, evidence_id: edge.evidenceId, role: edge.role };
		if (!(await readRow(batch.context.sql, batch.context.catalog, "verification_evidence", key)))
			await batch.add("verification_evidence", key);
	}
	for (const contradictionId of contradictions) {
		const key = { verification_id: id, contradiction_id: contradictionId };
		if (!(await readRow(batch.context.sql, batch.context.catalog, "verification_contradictions", key)))
			await batch.add("verification_contradictions", key);
	}
}
async function verifyFindingReproducers(batch: RecordBatch, findingId: string): Promise<void> {
	const evidenceIds = new Set<string>();
	for (const edge of await readRows(batch.context.sql, batch.context.catalog, "finding_evidence", {
		finding_id: findingId,
		relationship: "reproducer_script",
	}))
		evidenceIds.add(text(edge, "evidence_id"));
	for (const edge of await readRows(batch.context.sql, batch.context.catalog, "finding_investigations", {
		finding_id: findingId,
	})) {
		for (const experiment of await readRows(batch.context.sql, batch.context.catalog, "experiments", {
			investigation_id: text(edge, "investigation_id"),
		})) {
			if (experiment.execution_state === "planned") continue;
			for (const script of await readRows(batch.context.sql, batch.context.catalog, "experiment_evidence", {
				experiment_id: text(experiment, "id"),
				role: "reproducer_script",
			}))
				evidenceIds.add(text(script, "evidence_id"));
		}
	}
	for (const id of evidenceIds) {
		const evidence = await batch.get("evidence", id);
		requireCondition(evidence.local_preservation === "preserved", "A load-bearing reproducer is not preserved");
		await batch.preserved(evidence);
	}
}

async function evidenceSourceIdentities(batch: RecordBatch, evidence: Readonly<RawRecordRow>): Promise<string[]> {
	const identities: string[] = evidence.sha256 ? [`sha256:${evidence.sha256}`] : [];
	for (const reference of await readRows(batch.context.sql, batch.context.catalog, "evidence_native_references", {
		evidence_id: text(evidence, "id"),
	})) {
		identities.push(
			stableStringifyJson([reference.native_project_id, reference.object_kind, reference.native_object_id]),
		);
	}
	return identities;
}

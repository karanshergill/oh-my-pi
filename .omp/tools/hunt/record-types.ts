import type { ReservedSQL } from "bun";

export type UUID = string;
/** Canonical unsigned decimal; never a JavaScript number. */
export type UInt = string;
/** UTC, exactly YYYY-MM-DD HH:mm:ss.ffffff; no Date conversion. */
export type UtcTime = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
/** Explicit wrapper permits JSON numbers beyond JavaScript's exact integer range. */
export interface JsonDocument {
	readonly json: string;
}
export type InputValue = string | null | JsonDocument;
export type InputRow = Readonly<Record<string, InputValue>>;
export type RowKey = Readonly<Record<string, string>>;
export interface ColumnMetadata {
	readonly name: string;
	readonly dataType: string;
	readonly columnType: string;
	readonly nullable: boolean;
	readonly defaultValue: string | null;
}
export interface ForeignKeyMetadata {
	readonly name: string;
	readonly columns: readonly string[];
	readonly referencedTable: string;
	readonly referencedColumns: readonly string[];
}
export interface TableMetadata {
	readonly name: string;
	readonly columns: readonly ColumnMetadata[];
	readonly primaryKey: readonly string[];
	readonly foreignKeys: readonly ForeignKeyMetadata[];
}
export type RecordCatalog = ReadonlyMap<string, TableMetadata>;
/** JSON text is the exact CAST(JSON AS CHAR) rendering of pinned Dolt 2.6.2.
 * Snapshot format upgrades must not silently reinterpret old receipt hashes. */
export type CanonicalCell =
	| { readonly kind: "sql-null" }
	| { readonly kind: "json-text"; readonly value: string }
	| { readonly kind: "scalar"; readonly value: string };
export interface RowLocator {
	readonly table: string;
	readonly key: RowKey;
}
export interface CanonicalRow extends RowLocator {
	readonly format: "hunt-row-v1";
	readonly columns: Readonly<Record<string, CanonicalCell>>;
}
export interface RowReceipt extends RowLocator {
	readonly revision: UInt | null;
	readonly poststate: CanonicalRow | null;
	readonly poststateSha256: string;
}
export interface RecordReadContext {
	readonly sql: ReservedSQL;
	readonly catalog: RecordCatalog;
	readonly engagementId: UUID;
	readonly engagementRoot: string;
	readonly signal?: AbortSignal;
}
/** Supplied only by the trusted transport adapter after its actual native read.
 * Never deserialize this from model-authored HuntChange input. */
export interface NativeFindingReadback {
	readonly attemptId: UUID;
	readonly nativeProjectId: UUID;
	readonly instanceId: string;
	readonly projectId: string;
	readonly nativeFindingId: string;
	readonly title: string;
	readonly description: string;
	readonly observedAt: UtcTime;
}
export interface RecordWriteContext extends RecordReadContext {
	readonly operationId: UUID;
	readonly recorderActorId: UUID;
	readonly recorderRunId: UUID;
	readonly recordedAt: UtcTime;
	readonly nativeReadbacks?: readonly NativeFindingReadback[];
}
export type CheckpointReason =
	| "target_model"
	| "experiment_result"
	| "assessment"
	| "report"
	| "sync"
	| "handoff"
	| "other";
export interface ApplyRecordReceipt {
	readonly format: "hunt-record-receipt-v1";
	readonly operationId: UUID;
	readonly generatedIds: readonly { changeIndex: number; table: string; id: UUID }[];
	readonly rows: readonly RowReceipt[];
	readonly checkpointReasons: readonly CheckpointReason[];
}
export interface RevisionGuard {
	readonly table: string;
	readonly id: UUID;
	readonly revision: UInt;
}
export type Outcome = "Untested" | "Blocked" | "Inconclusive" | "Not reproduced" | "Not applicable" | "Validated";
export type Relationship = "supports" | "contradicts" | "context";
export interface OrdinaryFields {
	actors: { actor_kind: "agent" | "person" | "tool"; external_identity: string; label?: string | null };
	runs: {
		actor_id: UUID;
		native_run_identity?: string | null;
		started_at?: UtcTime | null;
		ended_at?: UtcTime | null;
		context?: JsonDocument | null;
	};
	engagements: { name: string; objective?: string | null; context_gaps?: JsonDocument | null };
	native_projects: { tool_name: string; instance_id: string; project_id: string; label?: string | null };
	test_identities: { label: string; role_context?: string | null; tenant_context?: string | null };
	engagement_references: {
		reference_kind: "scope" | "authorization" | "guideline" | "reporting_requirement";
		source_locator: string;
		source_version?: string | null;
		retrieved_at?: UtcTime | null;
		native_project_id?: UUID | null;
		native_object_id?: string | null;
		content_summary?: string | null;
	};
	evidence: {
		source_description: string;
		source_url?: string | null;
		captured_at?: UtcTime | null;
		capture_time_note?: string | null;
		media_type?: string | null;
		byte_count?: UInt | null;
		sha256?: string | null;
		capture_completeness: "unknown" | "complete" | "truncated" | "missing" | "unavailable";
		capture_detail?: string | null;
		local_preservation: "not_preserved" | "preserved" | "missing" | "unavailable";
		artifact_relative_path?: string | null;
		preservation_detail?: string | null;
		derivation_kind: "original" | "derived" | "unknown";
		execution_context?: JsonDocument | null;
	};
	research_sources: {
		original_url: string;
		collection_provenance?: JsonDocument | null;
		collection_kind: "original_nomination" | "later_addition" | "ai_collected" | "other" | "unknown";
		collected_at?: UtcTime | null;
		published_at?: UtcTime | null;
		relevant_dates_versions?: JsonDocument | null;
		applicability?: string | null;
	};
	surfaces: {
		label: string;
		observed_features?: JsonDocument | null;
		interfaces?: JsonDocument | null;
		workflows?: JsonDocument | null;
		technology_facts?: JsonDocument | null;
		technology_assumptions?: JsonDocument | null;
	};
	target_models: {
		observed_behavior?: string | null;
		observed_relationships?: JsonDocument | null;
		state_chronology?: JsonDocument | null;
		trust_boundaries?: JsonDocument | null;
		labeled_assumptions?: JsonDocument | null;
		material_unknowns?: JsonDocument | null;
	};
	target_model_claims: {
		target_model_id: UUID;
		claim: string;
		claim_kind: "observation" | "assumption" | "inference" | "unknown";
		context?: JsonDocument | null;
	};
	approach_families: { mechanism_or_assumption: string; distinguishing_rationale?: string | null };
	investigations: {
		hypothesis: string;
		mechanism?: string | null;
		input_to_effect_path?: JsonDocument | null;
		context?: JsonDocument | null;
		outcome: Outcome;
		assessment?: string | null;
		blockers?: JsonDocument | null;
		next_action?: string | null;
	};
	investigation_propositions: {
		investigation_id: UUID;
		proposition_kind: "decisive" | "prerequisite" | "competing_explanation";
		statement: string;
		status: "unknown" | "assumed" | "supported" | "refuted" | "conditional";
		assessment?: string | null;
	};
	experiments: {
		investigation_id: UUID;
		hypothesis_tested: string;
		baseline?: JsonDocument | null;
		controls?: JsonDocument | null;
		variations?: JsonDocument | null;
		execution_context?: JsonDocument | null;
		predicted_signal?: string | null;
		recording_mode: "prospective" | "retrospective";
		execution_time_notes?: string | null;
		planned_at?: UtcTime | null;
	};
	findings: { assessment?: string | null; readiness_gaps?: JsonDocument | null };
}
export type OrdinaryTable = keyof OrdinaryFields;
export type CreateRecord = {
	[T in OrdinaryTable]: {
		readonly kind: "create";
		readonly table: T;
		readonly id?: UUID;
		readonly fields: OrdinaryFields[T];
		readonly owner?: RevisionGuard;
	};
}[OrdinaryTable];
export interface EditableFields {
	runs: Pick<OrdinaryFields["runs"], "ended_at" | "context">;
	engagements: OrdinaryFields["engagements"];
	native_projects: Pick<OrdinaryFields["native_projects"], "label">;
	test_identities: OrdinaryFields["test_identities"];
	engagement_references: Pick<OrdinaryFields["engagement_references"], "content_summary">;
	evidence: Pick<
		OrdinaryFields["evidence"],
		"local_preservation" | "preservation_detail" | "sha256" | "byte_count" | "artifact_relative_path"
	>;
	research_sources: Pick<OrdinaryFields["research_sources"], "applicability">;
	surfaces: OrdinaryFields["surfaces"];
	target_models: OrdinaryFields["target_models"];
	target_model_claims: Omit<OrdinaryFields["target_model_claims"], "target_model_id">;
	approach_families: OrdinaryFields["approach_families"];
	investigations: OrdinaryFields["investigations"];
	investigation_propositions: Omit<OrdinaryFields["investigation_propositions"], "investigation_id">;
	experiments: Omit<OrdinaryFields["experiments"], "investigation_id" | "recording_mode">;
}
export type EditRecord = {
	[T in keyof EditableFields]: {
		readonly kind: "edit";
		readonly table: T;
		readonly id: UUID;
		readonly expectedRevision: UInt;
		readonly fields: Partial<EditableFields[T]>;
		readonly owner?: RevisionGuard;
	};
}[keyof EditableFields];
export interface RelationFields {
	evidence_native_references: {
		evidence_id: UUID;
		native_project_id: UUID;
		object_kind: string;
		native_object_id: string;
		variant?: string | null;
	};
	evidence_derivations: { derived_evidence_id: UUID; original_evidence_id: UUID; transformation: string };
	engagement_reference_evidence: { engagement_reference_id: UUID; evidence_id: UUID };
	research_source_evidence: { research_source_id: UUID; evidence_id: UUID };
	surface_evidence: { surface_id: UUID; evidence_id: UUID; relationship: Relationship };
	surface_research_sources: { surface_id: UUID; research_source_id: UUID };
	target_model_surfaces: { target_model_id: UUID; surface_id: UUID };
	target_model_claim_evidence: { target_model_claim_id: UUID; evidence_id: UUID; relationship: Relationship };
	target_model_claim_observations: { target_model_claim_id: UUID; observation_id: UUID; relationship: Relationship };
	investigation_approach_families: { investigation_id: UUID; approach_family_id: UUID };
	investigation_surfaces: { investigation_id: UUID; surface_id: UUID };
	investigation_model_claims: {
		investigation_id: UUID;
		target_model_claim_id: UUID;
		role: "premise" | "subject" | "context";
	};
	investigation_research_sources: { investigation_id: UUID; research_source_id: UUID; applicability?: string | null };
	investigation_evidence: { investigation_id: UUID; evidence_id: UUID; relationship: Relationship };
	investigation_proposition_evidence: { proposition_id: UUID; evidence_id: UUID; relationship: Relationship };
	experiment_test_identities: { experiment_id: UUID; test_identity_id: UUID; context_snapshot?: JsonDocument | null };
	experiment_evidence: {
		experiment_id: UUID;
		evidence_id: UUID;
		role:
			| "baseline"
			| "control"
			| "variation"
			| "reproducer_script"
			| "execution_context"
			| "result"
			| "reconciliation";
	};
	finding_investigations: { finding_id: UUID; investigation_id: UUID };
	finding_evidence: { finding_id: UUID; evidence_id: UUID; relationship: Relationship | "reproducer_script" };
	finding_contributors: {
		finding_id: UUID;
		actor_id: UUID;
		run_id: UUID;
		contribution: "originator" | "substantial_developer";
	};
}
export type RelationTable = keyof RelationFields;
export type ChangeRelation = {
	[T in RelationTable]: {
		readonly kind: "relation";
		readonly table: T;
		readonly action: "add" | "remove";
		readonly id?: UUID;
		readonly fields: RelationFields[T];
		readonly owner: RevisionGuard;
	};
}[RelationTable];
export interface ExperimentTransition {
	readonly kind: "experiment";
	readonly id: UUID;
	readonly expectedRevision: UInt;
	readonly state: "running" | "finished" | "uncertain";
	readonly executorActorId?: UUID;
	readonly executorRunId?: UUID;
	readonly startedAt?: UtcTime | null;
	readonly finishedAt?: UtcTime | null;
	readonly timeNotes?: string;
	readonly uncertainty?: string;
	readonly reconciliation?: { detail: string; evidenceIds: readonly UUID[] };
}
export interface ObservationChange {
	readonly kind: "observation";
	readonly id?: UUID;
	readonly experiment: RevisionGuard;
	readonly fields: {
		observed_result?: string | null;
		measurement?: JsonDocument | null;
		tool_transport_failure?: string | null;
		observation_kind: "result" | "failure" | "correction" | "reconciliation";
		observed_at?: UtcTime | null;
		context?: JsonDocument | null;
		supersedes_observation_id?: UUID | null;
	};
	readonly evidenceIds: readonly UUID[];
}
export interface ClaimChange {
	readonly kind: "claim";
	readonly id?: UUID;
	readonly finding: RevisionGuard;
	readonly fields: {
		security_violation?: string | null;
		mechanism?: string | null;
		prerequisites?: JsonDocument | null;
		reproduction?: string | null;
		demonstrated_impact?: string | null;
		conditional_impact?: string | null;
		claim_gaps?: JsonDocument | null;
	};
	readonly evidence: readonly {
		evidenceId: UUID;
		relationship: "supports" | "contradicts" | "prerequisite" | "reproduction" | "impact" | "context";
		detail?: string;
	}[];
}
export interface VerificationExperimentLink {
	readonly experimentId: UUID;
	readonly role: "assessment" | "context";
}
export interface VerificationEvidenceLink {
	readonly evidenceId: UUID;
	readonly role: "assessment" | "context" | "supersession";
}
export interface VerificationChange {
	readonly kind: "verification";
	readonly id?: UUID;
	readonly finding: RevisionGuard;
	readonly assessedClaimRevisionId: UUID;
	readonly originatorActorId: UUID;
	readonly originatorRunId: UUID;
	readonly verifierActorId: UUID;
	readonly verifierRunId: UUID;
	readonly independenceAssessment: string;
	readonly outcome: "pending" | "confirmed" | "failed" | "inconclusive" | "disputed";
	readonly assessment: string;
	readonly unresolvedDisagreements?: string;
	readonly experiments: readonly VerificationExperimentLink[];
	readonly evidence: readonly VerificationEvidenceLink[];
	readonly contradictionIds: readonly UUID[];
	readonly supersedes?: { readonly verification: RevisionGuard; readonly rationale: string };
}
/** Only an unsuperseded pending assessment can finalize in place. A different
 * verifier/run or correction of a completed assessment creates a superseding row. */
export interface VerificationResultChange {
	readonly kind: "verification-result";
	readonly verification: RevisionGuard;
	readonly finding: RevisionGuard;
	readonly outcome: "confirmed" | "failed" | "inconclusive" | "disputed";
	readonly independenceAssessment: string;
	readonly assessment: string;
	readonly unresolvedDisagreements?: string;
	readonly experiments: readonly VerificationExperimentLink[];
	readonly evidence: readonly VerificationEvidenceLink[];
	readonly contradictionIds: readonly UUID[];
}
export interface FindingAssessmentChange {
	readonly kind: "finding-assessment";
	readonly finding: RevisionGuard;
	readonly assessment: string;
	readonly readiness: "incomplete" | "needs_verification" | "disputed" | "ready";
	readonly gaps: JsonDocument;
}
export interface ContradictionReference {
	readonly table:
		| "engagements"
		| "surfaces"
		| "target_models"
		| "target_model_claims"
		| "approach_families"
		| "investigations"
		| "investigation_propositions"
		| "experiments"
		| "observations"
		| "evidence"
		| "research_sources"
		| "findings"
		| "finding_claim_revisions"
		| "verifications"
		| "report_revisions"
		| "caido_links"
		| "sync_attempts";
	readonly id: UUID;
	readonly revision?: UInt;
}
export interface ContradictionChange {
	readonly kind: "contradiction";
	readonly id?: UUID;
	readonly conflict: string;
	readonly context?: JsonDocument;
	readonly nextAction: string;
	readonly claims: readonly { snapshot: string; context?: JsonDocument; reference?: ContradictionReference }[];
	readonly evidence: readonly { evidenceId: UUID; role: "original_conflict" | "context" }[];
}
export interface ContradictionEventChange {
	readonly kind: "contradiction-event";
	readonly id?: UUID;
	readonly contradiction: RevisionGuard;
	readonly state: "open" | "resolved";
	readonly rationale: string;
	readonly context?: JsonDocument;
	readonly occurredAt?: UtcTime;
	readonly nextAction?: string;
	readonly evidenceIds: readonly UUID[];
}
export interface ReportChange {
	readonly kind: "report";
	readonly id?: UUID;
	readonly finding: RevisionGuard;
	readonly title: string;
	readonly body: string;
	readonly supportingCheckpointHash: string;
	readonly evidence: readonly { evidenceId: UUID; role?: string }[];
}
export interface ReportCheckpointChange {
	readonly kind: "report-checkpoint";
	readonly finding: RevisionGuard;
	readonly reportRevisionId: UUID;
	readonly checkpointHash: string;
}
export interface CaidoLinkChange {
	readonly kind: "caido-link";
	readonly id?: UUID;
	readonly finding: RevisionGuard;
	readonly nativeProjectId: UUID;
	/** Existing ID adoption is explicit; never inferred by title. */ readonly nativeFindingId?: string;
	readonly associationEvidenceId?: UUID;
}
export interface SyncIntentChange {
	readonly kind: "sync-intent";
	readonly id?: UUID;
	readonly link: RevisionGuard;
	readonly reportRevisionId: UUID;
	readonly checkpointHash: string;
	readonly operation: "create" | "update";
	readonly previousRemoteState: "absent" | "present";
	readonly previousRemoteOwnedFieldsSha256?: string;
	readonly creationRequestReferenceId?: UUID;
}
export interface SyncOutcomeChange {
	readonly kind: "sync-outcome";
	readonly attempt: RevisionGuard;
	readonly link: RevisionGuard;
	readonly result: "uncertain" | "succeeded" | "conflict" | "failed";
	readonly dispatchedAt?: UtcTime;
	readonly finishedAt?: UtcTime;
	readonly reconciledAt?: UtcTime;
	readonly returnedNativeFindingId?: string;
	readonly observedOwnedFieldsSha256?: string;
	readonly detail: string;
}
export interface ExportIntentChange {
	readonly kind: "export-intent";
	readonly id?: UUID;
	readonly finding: RevisionGuard;
	readonly reportRevisionId: UUID;
	readonly intendedFileSha256: string;
	readonly previousFileState: "absent" | "present";
	readonly previousFileSha256?: string;
}
export interface ExportOutcomeChange {
	readonly kind: "export-outcome";
	readonly attempt: RevisionGuard;
	readonly finding: RevisionGuard;
	readonly result: "uncertain" | "succeeded" | "conflict" | "failed";
	readonly detail: string;
}
export type HuntChange =
	| CreateRecord
	| EditRecord
	| ChangeRelation
	| ExperimentTransition
	| ObservationChange
	| ClaimChange
	| VerificationChange
	| VerificationResultChange
	| FindingAssessmentChange
	| ContradictionChange
	| ContradictionEventChange
	| ReportChange
	| ReportCheckpointChange
	| CaidoLinkChange
	| SyncIntentChange
	| SyncOutcomeChange
	| ExportIntentChange
	| ExportOutcomeChange;
export type InspectRecordsRequest =
	| { readonly kind: "get"; readonly locator: RowLocator; readonly asOf?: string }
	| {
			readonly kind: "list";
			readonly table: string;
			readonly where?: RowKey;
			readonly after?: RowKey;
			readonly limit: number;
			readonly asOf?: string;
	  }
	| {
			readonly kind: "relationships";
			readonly locator: RowLocator;
			readonly relatedTable: string;
			readonly foreignKey: string;
			readonly direction: "outgoing" | "incoming";
			readonly after?: RowKey;
			readonly limit: number;
			readonly asOf?: string;
	  };
export interface InspectRecordsResult {
	readonly format: "hunt-record-inspection-v1";
	readonly view: { readonly kind: "working" } | { readonly kind: "checkpoint"; readonly hash: string };
	readonly rows: readonly CanonicalRow[];
	readonly next: RowKey | null;
	readonly empty: boolean;
}

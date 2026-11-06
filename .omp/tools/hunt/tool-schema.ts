import type { Type } from "@oh-my-pi/omptype";
import type { CustomToolAPI } from "@oh-my-pi/pi-coding-agent";
import type { HuntChange, InspectRecordsRequest } from "./record-types";
import { checkpointHash, RecordError, uint, utc, uuid } from "./record-sql";
import type { HuntRequest } from "./store-types";

export interface HuntToolParameters {
	readonly i: string;
	readonly request: HuntRequest;
}

/** Shape validation is exhaustive; ownership, CAS and scientific invariants stay in the domain writer. */
export function buildHuntParameters(api: Pick<CustomToolAPI, "arktype">): Type<HuntToolParameters> {
	const type = api.arktype;
	const guardedString = (guard: (value: string) => string) =>
		type("string").narrow((value, ctx) => {
			try {
				guard(value);
				return true;
			} catch (error) {
				if (!(error instanceof RecordError)) throw error;
				return ctx.mustBe(error.message);
			}
		});
	const id = guardedString(uuid);
	const unsigned = guardedString(uint);
	const revision = guardedString(value => uint(value, true));
	const timestamp = guardedString(utc);
	const checkpoint = guardedString(checkpointHash);
	const nullableText = type("string | null");
	const nullableId = id.or("null");
	const nullableTime = timestamp.or("null");
	const json = type({ json: "string" });
	const nullableJson = json.or("null");
	const guard = type({ table: "string", id, revision });
	const relationship = type("'supports' | 'contradicts' | 'context'");
	const outcome = type("'Untested' | 'Blocked' | 'Inconclusive' | 'Not reproduced' | 'Not applicable' | 'Validated'");
	const checkpointReason = type(
		"'target_model' | 'experiment_result' | 'assessment' | 'report' | 'sync' | 'handoff' | 'other'",
	);

	const actors = type({
		actor_kind: "'agent' | 'person' | 'tool'",
		external_identity: "string",
		"label?": nullableText,
	});
	const runs = type({
		actor_id: id,
		"native_run_identity?": nullableText,
		"started_at?": nullableTime,
		"ended_at?": nullableTime,
		"context?": nullableJson,
	});
	const engagements = type({ name: "string", "objective?": nullableText, "context_gaps?": nullableJson });
	const nativeProjects = type({
		tool_name: "string",
		instance_id: "string",
		project_id: "string",
		"label?": nullableText,
	});
	const testIdentities = type({ label: "string", "role_context?": nullableText, "tenant_context?": nullableText });
	const engagementReferences = type({
		reference_kind: "'scope' | 'authorization' | 'guideline' | 'reporting_requirement'",
		source_locator: "string",
		"source_version?": nullableText,
		"retrieved_at?": nullableTime,
		"native_project_id?": nullableId,
		"native_object_id?": nullableText,
		"content_summary?": nullableText,
	});
	const evidence = type({
		source_description: "string",
		"source_url?": nullableText,
		"captured_at?": nullableTime,
		"capture_time_note?": nullableText,
		"media_type?": nullableText,
		"byte_count?": unsigned.or("null"),
		"sha256?": nullableText,
		capture_completeness: "'unknown' | 'complete' | 'truncated' | 'missing' | 'unavailable'",
		"capture_detail?": nullableText,
		local_preservation: "'not_preserved' | 'preserved' | 'missing' | 'unavailable'",
		"artifact_relative_path?": nullableText,
		"preservation_detail?": nullableText,
		derivation_kind: "'original' | 'derived' | 'unknown'",
		"execution_context?": nullableJson,
	});
	const researchSources = type({
		original_url: "string",
		"collection_provenance?": nullableJson,
		collection_kind: "'original_nomination' | 'later_addition' | 'ai_collected' | 'other' | 'unknown'",
		"collected_at?": nullableTime,
		"published_at?": nullableTime,
		"relevant_dates_versions?": nullableJson,
		"applicability?": nullableText,
	});
	const surfaces = type({
		label: "string",
		"observed_features?": nullableJson,
		"interfaces?": nullableJson,
		"workflows?": nullableJson,
		"technology_facts?": nullableJson,
		"technology_assumptions?": nullableJson,
	});
	const targetModels = type({
		"observed_behavior?": nullableText,
		"observed_relationships?": nullableJson,
		"state_chronology?": nullableJson,
		"trust_boundaries?": nullableJson,
		"labeled_assumptions?": nullableJson,
		"material_unknowns?": nullableJson,
	});
	const targetModelClaims = type({
		target_model_id: id,
		claim: "string",
		claim_kind: "'observation' | 'assumption' | 'inference' | 'unknown'",
		"context?": nullableJson,
	});
	const approachFamilies = type({ mechanism_or_assumption: "string", "distinguishing_rationale?": nullableText });
	const investigations = type({
		hypothesis: "string",
		"mechanism?": nullableText,
		"input_to_effect_path?": nullableJson,
		"context?": nullableJson,
		outcome,
		"assessment?": nullableText,
		"blockers?": nullableJson,
		"next_action?": nullableText,
	});
	const investigationPropositions = type({
		investigation_id: id,
		proposition_kind: "'decisive' | 'prerequisite' | 'competing_explanation'",
		statement: "string",
		status: "'unknown' | 'assumed' | 'supported' | 'refuted' | 'conditional'",
		"assessment?": nullableText,
	});
	const experiments = type({
		investigation_id: id,
		hypothesis_tested: "string",
		"baseline?": nullableJson,
		"controls?": nullableJson,
		"variations?": nullableJson,
		"execution_context?": nullableJson,
		"predicted_signal?": nullableText,
		recording_mode: "'prospective' | 'retrospective'",
		"execution_time_notes?": nullableText,
		"planned_at?": nullableTime,
	});
	const findings = type({ "assessment?": nullableText, "readiness_gaps?": nullableJson });
	const createBase = { kind: "'create'", "id?": id, "owner?": guard } as const;
	const create = type.or(
		type({ ...createBase, table: "'actors'", fields: actors }),
		type({ ...createBase, table: "'runs'", fields: runs }),
		type({ ...createBase, table: "'engagements'", fields: engagements }),
		type({ ...createBase, table: "'native_projects'", fields: nativeProjects }),
		type({ ...createBase, table: "'test_identities'", fields: testIdentities }),
		type({ ...createBase, table: "'engagement_references'", fields: engagementReferences }),
		type({ ...createBase, table: "'evidence'", fields: evidence }),
		type({ ...createBase, table: "'research_sources'", fields: researchSources }),
		type({ ...createBase, table: "'surfaces'", fields: surfaces }),
		type({ ...createBase, table: "'target_models'", fields: targetModels }),
		type({ ...createBase, table: "'target_model_claims'", fields: targetModelClaims }),
		type({ ...createBase, table: "'approach_families'", fields: approachFamilies }),
		type({ ...createBase, table: "'investigations'", fields: investigations }),
		type({ ...createBase, table: "'investigation_propositions'", fields: investigationPropositions }),
		type({ ...createBase, table: "'experiments'", fields: experiments }),
		type({ ...createBase, table: "'findings'", fields: findings }),
	);
	const editBase = { kind: "'edit'", id, expectedRevision: revision, "owner?": guard } as const;
	const edit = type.or(
		type({ ...editBase, table: "'runs'", fields: runs.pick("ended_at", "context").partial() }),
		type({ ...editBase, table: "'engagements'", fields: engagements.partial() }),
		type({ ...editBase, table: "'native_projects'", fields: nativeProjects.pick("label").partial() }),
		type({ ...editBase, table: "'test_identities'", fields: testIdentities.partial() }),
		type({
			...editBase,
			table: "'engagement_references'",
			fields: engagementReferences.pick("content_summary").partial(),
		}),
		type({
			...editBase,
			table: "'evidence'",
			fields: evidence
				.pick("local_preservation", "preservation_detail", "sha256", "byte_count", "artifact_relative_path")
				.partial(),
		}),
		type({ ...editBase, table: "'research_sources'", fields: researchSources.pick("applicability").partial() }),
		type({ ...editBase, table: "'surfaces'", fields: surfaces.partial() }),
		type({ ...editBase, table: "'target_models'", fields: targetModels.partial() }),
		type({
			...editBase,
			table: "'target_model_claims'",
			fields: targetModelClaims.omit("target_model_id").partial(),
		}),
		type({ ...editBase, table: "'approach_families'", fields: approachFamilies.partial() }),
		type({ ...editBase, table: "'investigations'", fields: investigations.partial() }),
		type({
			...editBase,
			table: "'investigation_propositions'",
			fields: investigationPropositions.omit("investigation_id").partial(),
		}),
		type({
			...editBase,
			table: "'experiments'",
			fields: experiments.omit("investigation_id", "recording_mode").partial(),
		}),
	);
	const relationBase = { kind: "'relation'", action: "'add' | 'remove'", "id?": id, owner: guard } as const;
	const relation = type.or(
		type({
			...relationBase,
			table: "'evidence_native_references'",
			fields: {
				evidence_id: id,
				native_project_id: id,
				object_kind: "string",
				native_object_id: "string",
				"variant?": nullableText,
			},
		}),
		type({
			...relationBase,
			table: "'evidence_derivations'",
			fields: { derived_evidence_id: id, original_evidence_id: id, transformation: "string" },
		}),
		type({
			...relationBase,
			table: "'engagement_reference_evidence'",
			fields: { engagement_reference_id: id, evidence_id: id },
		}),
		type({
			...relationBase,
			table: "'research_source_evidence'",
			fields: { research_source_id: id, evidence_id: id },
		}),
		type({ ...relationBase, table: "'surface_evidence'", fields: { surface_id: id, evidence_id: id, relationship } }),
		type({
			...relationBase,
			table: "'surface_research_sources'",
			fields: { surface_id: id, research_source_id: id },
		}),
		type({ ...relationBase, table: "'target_model_surfaces'", fields: { target_model_id: id, surface_id: id } }),
		type({
			...relationBase,
			table: "'target_model_claim_evidence'",
			fields: { target_model_claim_id: id, evidence_id: id, relationship },
		}),
		type({
			...relationBase,
			table: "'target_model_claim_observations'",
			fields: { target_model_claim_id: id, observation_id: id, relationship },
		}),
		type({
			...relationBase,
			table: "'investigation_approach_families'",
			fields: { investigation_id: id, approach_family_id: id },
		}),
		type({ ...relationBase, table: "'investigation_surfaces'", fields: { investigation_id: id, surface_id: id } }),
		type({
			...relationBase,
			table: "'investigation_model_claims'",
			fields: { investigation_id: id, target_model_claim_id: id, role: "'premise' | 'subject' | 'context'" },
		}),
		type({
			...relationBase,
			table: "'investigation_research_sources'",
			fields: { investigation_id: id, research_source_id: id, "applicability?": nullableText },
		}),
		type({
			...relationBase,
			table: "'investigation_evidence'",
			fields: { investigation_id: id, evidence_id: id, relationship },
		}),
		type({
			...relationBase,
			table: "'investigation_proposition_evidence'",
			fields: { proposition_id: id, evidence_id: id, relationship },
		}),
		type({
			...relationBase,
			table: "'experiment_test_identities'",
			fields: { experiment_id: id, test_identity_id: id, "context_snapshot?": nullableJson },
		}),
		type({
			...relationBase,
			table: "'experiment_evidence'",
			fields: {
				experiment_id: id,
				evidence_id: id,
				role: "'baseline' | 'control' | 'variation' | 'reproducer_script' | 'execution_context' | 'result' | 'reconciliation'",
			},
		}),
		type({ ...relationBase, table: "'finding_investigations'", fields: { finding_id: id, investigation_id: id } }),
		type({
			...relationBase,
			table: "'finding_evidence'",
			fields: { finding_id: id, evidence_id: id, relationship: relationship.or("'reproducer_script'") },
		}),
		type({
			...relationBase,
			table: "'finding_contributors'",
			fields: { finding_id: id, actor_id: id, run_id: id, contribution: "'originator' | 'substantial_developer'" },
		}),
	);
	const verificationLinks = {
		experiments: type({ experimentId: id, role: "'assessment' | 'context'" }).array(),
		evidence: type({ evidenceId: id, role: "'assessment' | 'context' | 'supersession'" }).array(),
		contradictionIds: id.array(),
		independenceAssessment: "string",
		assessment: "string",
		"unresolvedDisagreements?": "string",
	} as const;
	const change: Type<HuntChange> = type.or(
		create,
		edit,
		relation,
		type({
			kind: "'experiment'",
			id,
			expectedRevision: revision,
			state: "'running' | 'finished' | 'uncertain'",
			"executorActorId?": id,
			"executorRunId?": id,
			"startedAt?": nullableTime,
			"finishedAt?": nullableTime,
			"timeNotes?": "string",
			"uncertainty?": "string",
			"reconciliation?": { detail: "string", evidenceIds: id.array() },
		}),
		type({
			kind: "'observation'",
			"id?": id,
			experiment: guard,
			fields: {
				"observed_result?": nullableText,
				"measurement?": nullableJson,
				"tool_transport_failure?": nullableText,
				observation_kind: "'result' | 'failure' | 'correction' | 'reconciliation'",
				"observed_at?": nullableTime,
				"context?": nullableJson,
				"supersedes_observation_id?": nullableId,
			},
			evidenceIds: id.array(),
		}),
		type({
			kind: "'claim'",
			"id?": id,
			finding: guard,
			fields: {
				"security_violation?": nullableText,
				"mechanism?": nullableText,
				"prerequisites?": nullableJson,
				"reproduction?": nullableText,
				"demonstrated_impact?": nullableText,
				"conditional_impact?": nullableText,
				"claim_gaps?": nullableJson,
			},
			evidence: type({
				evidenceId: id,
				relationship: "'supports' | 'contradicts' | 'prerequisite' | 'reproduction' | 'impact' | 'context'",
				"detail?": "string",
			}).array(),
		}),
		type({
			kind: "'verification'",
			"id?": id,
			finding: guard,
			assessedClaimRevisionId: id,
			originatorActorId: id,
			originatorRunId: id,
			verifierActorId: id,
			verifierRunId: id,
			outcome: "'pending' | 'confirmed' | 'failed' | 'inconclusive' | 'disputed'",
			...verificationLinks,
			"supersedes?": { verification: guard, rationale: "string" },
		}),
		type({
			kind: "'verification-result'",
			verification: guard,
			finding: guard,
			outcome: "'confirmed' | 'failed' | 'inconclusive' | 'disputed'",
			...verificationLinks,
		}),
		type({
			kind: "'finding-assessment'",
			finding: guard,
			assessment: "string",
			readiness: "'incomplete' | 'needs_verification' | 'disputed' | 'ready'",
			gaps: json,
		}),
		type({
			kind: "'contradiction'",
			"id?": id,
			conflict: "string",
			"context?": json,
			nextAction: "string",
			claims: type({
				snapshot: "string",
				"context?": json,
				"reference?": {
					table: "'engagements' | 'surfaces' | 'target_models' | 'target_model_claims' | 'approach_families' | 'investigations' | 'investigation_propositions' | 'experiments' | 'observations' | 'evidence' | 'research_sources' | 'findings' | 'finding_claim_revisions' | 'verifications' | 'report_revisions' | 'caido_links' | 'sync_attempts'",
					id,
					"revision?": unsigned,
				},
			}).array(),
			evidence: type({ evidenceId: id, role: "'original_conflict' | 'context'" }).array(),
		}),
		type({
			kind: "'contradiction-event'",
			"id?": id,
			contradiction: guard,
			state: "'open' | 'resolved'",
			rationale: "string",
			"context?": json,
			"occurredAt?": timestamp,
			"nextAction?": "string",
			evidenceIds: id.array(),
		}),
		type({
			kind: "'report'",
			"id?": id,
			finding: guard,
			title: "string",
			body: "string",
			supportingCheckpointHash: checkpoint,
			evidence: type({ evidenceId: id, "role?": "string" }).array(),
		}),
		type({ kind: "'report-checkpoint'", finding: guard, reportRevisionId: id, checkpointHash: checkpoint }),
		type({
			kind: "'caido-link'",
			"id?": id,
			finding: guard,
			nativeProjectId: id,
			"nativeFindingId?": "string",
			"associationEvidenceId?": id,
		}),
		type({
			kind: "'sync-intent'",
			"id?": id,
			link: guard,
			reportRevisionId: id,
			checkpointHash: checkpoint,
			operation: "'create' | 'update'",
			previousRemoteState: "'absent' | 'present'",
			"previousRemoteOwnedFieldsSha256?": "string",
			"creationRequestReferenceId?": id,
		}),
		type({
			kind: "'sync-outcome'",
			attempt: guard,
			link: guard,
			result: "'uncertain' | 'succeeded' | 'conflict' | 'failed'",
			"dispatchedAt?": timestamp,
			"finishedAt?": timestamp,
			"reconciledAt?": timestamp,
			"returnedNativeFindingId?": "string",
			"observedOwnedFieldsSha256?": "string",
			detail: "string",
		}),
		type({
			kind: "'export-outcome'",
			attempt: guard,
			finding: guard,
			result: "'uncertain' | 'succeeded' | 'conflict' | 'failed'",
			detail: "string",
		}),
	);
	const rowKey = type({ "[string]": "string" });
	const locator = type({ table: "string", key: rowKey });
	const limit = type("number").divisibleBy(1).atLeast(1);
	const query: Type<InspectRecordsRequest> = type.or(
		type({ kind: "'get'", locator, "asOf?": checkpoint }),
		type({ kind: "'list'", table: "string", "where?": rowKey, "after?": rowKey, limit, "asOf?": checkpoint }),
		type({
			kind: "'relationships'",
			locator,
			relatedTable: "string",
			foreignKey: "string",
			direction: "'outgoing' | 'incoming'",
			"after?": rowKey,
			limit,
			"asOf?": checkpoint,
		}),
	);
	const request: Type<HuntRequest> = type.or(
		type({
			action: "'initialize'",
			engagementId: id,
			operationId: id,
			name: "string",
			"objective?": nullableText,
			"contextGaps?": nullableJson,
		}),
		type({ action: "'save'", engagementId: id, operationId: id, changes: type(change).array() }),
		type({
			action: "'preserve'",
			engagementId: id,
			operationId: id,
			sourcePath: "string",
			evidence: type.or(
				type({
					mode: "'create'",
					id,
					fields: evidence.omit("byte_count", "sha256", "local_preservation", "artifact_relative_path"),
				}),
				type({ mode: "'update'", id, revision }),
			),
		}),
		type({
			action: "'export'",
			engagementId: id,
			operationId: id,
			finding: type({ id, revision }),
			reportRevisionId: id,
		}),
		type({
			action: "'checkpoint'",
			engagementId: id,
			operationId: id,
			reason: checkpointReason,
			"detail?": "string",
		}),
		type({ action: "'status'", engagementId: id }),
		type({ action: "'inspect'", engagementId: id, query }),
		type({ action: "'operation' | 'resume'", engagementId: id, operationId: id }),
	);
	// Reject, never strip, undeclared keys at every nested object boundary.
	return type({ i: "string", request }).onDeepUndeclaredKey("reject");
}

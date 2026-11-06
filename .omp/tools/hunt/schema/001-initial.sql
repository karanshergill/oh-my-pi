-- Initial hunt record schema, version 1. Never run against an unselected database.
-- Caller must explicitly select hunt_<canonical engagement UUID without hyphens>/main.
-- No CREATE DATABASE, USE, session configuration, Dolt CALL, or migration runner is included.
-- MySQL/Dolt DDL is not transactionally rollbackable. Apply only to a new empty database;
-- on partial failure inspect the catalog and reconcile, never blindly replay this file.
-- UTC DATETIME(6), canonical UUID spelling, JSON shapes, immutable rows/sets, and optimistic
-- revisions are writer contracts. All foreign keys default to RESTRICT / NO ACTION.
-- JSON fields contain descriptive content only, never authoritative local record references.
-- Native IDs are opaque case-sensitive strings. Unknown information is NULL or absent rows.
-- No credentials or invented native project/actor/engagement data are seeded.

CREATE TABLE schema_versions (
    version BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    applied_at DATETIME(6) NOT NULL,
    definition_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    description VARCHAR(255) NOT NULL,
    CONSTRAINT schema_versions_positive CHECK (version > 0)
);

CREATE TABLE actors (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    actor_kind ENUM('agent', 'person', 'tool') NOT NULL,
    external_identity TEXT NOT NULL,
    label TEXT NULL,
    created_at DATETIME(6) NOT NULL
);

CREATE TABLE runs (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_run_identity TEXT NULL,
    started_at DATETIME(6) NULL,
    ended_at DATETIME(6) NULL,
    recorded_at DATETIME(6) NOT NULL,
    context JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    UNIQUE KEY runs_actor (id, actor_id),
    FOREIGN KEY (actor_id) REFERENCES actors(id),
    CONSTRAINT runs_revision CHECK (revision > 0),
    CONSTRAINT runs_times CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE engagements (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    singleton TINYINT NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    objective TEXT NULL,
    context_gaps JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY engagements_singleton (singleton),
    CONSTRAINT engagements_one CHECK (singleton = 1),
    CONSTRAINT engagements_revision CHECK (revision > 0),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id)
);

CREATE TABLE native_projects (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tool_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    instance_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    project_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    label TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY native_projects_identity (tool_name, instance_id, project_id),
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT native_projects_revision CHECK (revision > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE test_identities (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    label TEXT NOT NULL,
    role_context TEXT NULL,
    tenant_context TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT test_identities_revision CHECK (revision > 0)
);

-- A durable operation UUID and request digest identify one coordinated persistence intent.
-- SQL row/state inspection is not proof that an external action or a Dolt commit succeeded.
CREATE TABLE persistence_operations (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_kind ENUM('record_write', 'checkpoint', 'export', 'sync') NOT NULL,
    request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- Observed SQL-session correlation is evidence, never proof that a timed-out request ended.
    sql_connection_id BIGINT UNSIGNED NULL,
    sql_session_context JSON NULL,
    sql_dispatched_at DATETIME(6) NULL,
    sql_settled_at DATETIME(6) NULL,
    -- Immutable result snapshots include affected record locators, revisions and content hashes.
    -- These are historical receipts, not canonical domain relationships; domain links use FKs.
    sql_result_receipt JSON NULL,
    state ENUM('prepared', 'sql_committed', 'uncertain', 'completed', 'failed') NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    sql_committed_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    error_detail TEXT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- Adapter-derived OMP provenance, distinct from the agents who performed target work.
    recorder_session_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    recorder_tool_call_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    recorder_leaf_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    KEY persistence_operations_recorder_call (recorder_session_id, recorder_tool_call_id),
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT persistence_operations_revision CHECK (revision > 0),
    CONSTRAINT persistence_operations_recorder_pair CHECK (
        (recorder_session_id IS NULL AND recorder_tool_call_id IS NULL AND recorder_leaf_id IS NULL)
        OR (recorder_session_id IS NOT NULL AND recorder_tool_call_id IS NOT NULL)
    ),
    CONSTRAINT persistence_operations_receipt CHECK (
        (sql_committed_at IS NULL AND sql_result_receipt IS NULL)
        OR (sql_committed_at IS NOT NULL AND sql_result_receipt IS NOT NULL)
    ),
    CONSTRAINT persistence_operations_saved CHECK (state <> 'sql_committed' OR sql_committed_at IS NOT NULL)
);

CREATE TABLE checkpoints (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason ENUM('target_model', 'experiment_result', 'assessment', 'report', 'sync', 'handoff', 'other') NOT NULL,
    reason_detail TEXT NULL,
    expected_parent_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state ENUM('pending', 'uncertain', 'confirmed', 'content_conflict', 'failed') NOT NULL,
    commit_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    observed_commit_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    requested_at DATETIME(6) NOT NULL,
    confirmed_at DATETIME(6) NULL,
    error_detail TEXT NULL,
    UNIQUE KEY checkpoints_operation (operation_id),
    UNIQUE KEY checkpoints_hash (commit_hash),
    FOREIGN KEY (operation_id) REFERENCES persistence_operations(id),
    CONSTRAINT checkpoints_revision CHECK (revision > 0),
    CONSTRAINT checkpoints_content_conflict CHECK (state <> 'content_conflict' OR observed_commit_hash IS NOT NULL),
    CONSTRAINT checkpoints_confirmation CHECK (
        (state = 'confirmed' AND commit_hash IS NOT NULL AND confirmed_at IS NOT NULL)
        OR (state <> 'confirmed' AND commit_hash IS NULL AND confirmed_at IS NULL)
    )
);

-- Membership is frozen before DOLT_COMMIT; the committed marker and these exact receipts
-- are read back at the recovered commit, rather than treating current HEAD as its identity.
CREATE TABLE checkpoint_operations (
    checkpoint_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (checkpoint_id, operation_id),
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
    FOREIGN KEY (operation_id) REFERENCES persistence_operations(id)
);

CREATE TABLE evidence (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_description TEXT NOT NULL,
    source_url TEXT NULL,
    captured_at DATETIME(6) NULL,
    capture_time_note TEXT NULL,
    media_type VARCHAR(255) NULL,
    byte_count BIGINT UNSIGNED NULL,
    sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    capture_completeness ENUM('unknown', 'complete', 'truncated', 'missing', 'unavailable') NOT NULL,
    capture_detail TEXT NULL,
    local_preservation ENUM('not_preserved', 'preserved', 'missing', 'unavailable') NOT NULL,
    artifact_relative_path TEXT NULL,
    preservation_detail TEXT NULL,
    derivation_kind ENUM('original', 'derived', 'unknown') NOT NULL,
    execution_context JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT evidence_revision CHECK (revision > 0),
    CONSTRAINT evidence_preserved_metadata CHECK (
        local_preservation <> 'preserved' OR
        (artifact_relative_path IS NOT NULL AND sha256 IS NOT NULL AND byte_count IS NOT NULL)
    )
);

CREATE TABLE evidence_native_references (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    object_kind VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_object_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    variant VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    UNIQUE KEY evidence_native_reference_identity (evidence_id, native_project_id, object_kind, native_object_id, variant),
    UNIQUE KEY evidence_native_reference_project (id, native_project_id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id),
    FOREIGN KEY (native_project_id) REFERENCES native_projects(id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE evidence_derivations (
    derived_evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    transformation TEXT NOT NULL,
    PRIMARY KEY (derived_evidence_id, original_evidence_id),
    FOREIGN KEY (derived_evidence_id) REFERENCES evidence(id),
    FOREIGN KEY (original_evidence_id) REFERENCES evidence(id),
    CONSTRAINT evidence_derivations_distinct CHECK (derived_evidence_id <> original_evidence_id)
);

CREATE TABLE engagement_references (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reference_kind ENUM('scope', 'authorization', 'guideline', 'reporting_requirement') NOT NULL,
    source_locator TEXT NOT NULL,
    source_version TEXT NULL,
    retrieved_at DATETIME(6) NULL,
    native_project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    native_object_id TEXT NULL,
    content_summary TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (native_project_id) REFERENCES native_projects(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT engagement_references_revision CHECK (revision > 0),
    CONSTRAINT engagement_references_native_context CHECK (native_object_id IS NULL OR native_project_id IS NOT NULL)
);

CREATE TABLE engagement_reference_evidence (
    engagement_reference_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (engagement_reference_id, evidence_id),
    FOREIGN KEY (engagement_reference_id) REFERENCES engagement_references(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE research_sources (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_url TEXT NOT NULL,
    collection_provenance JSON NULL,
    collection_kind ENUM('original_nomination', 'later_addition', 'ai_collected', 'other', 'unknown') NOT NULL,
    collected_at DATETIME(6) NULL,
    published_at DATETIME(6) NULL,
    relevant_dates_versions JSON NULL,
    applicability TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT research_sources_revision CHECK (revision > 0)
);

CREATE TABLE research_source_evidence (
    research_source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (research_source_id, evidence_id),
    FOREIGN KEY (research_source_id) REFERENCES research_sources(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE surfaces (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    label TEXT NOT NULL,
    observed_features JSON NULL,
    interfaces JSON NULL,
    workflows JSON NULL,
    technology_facts JSON NULL,
    technology_assumptions JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT surfaces_revision CHECK (revision > 0)
);

CREATE TABLE surface_evidence (
    surface_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context') NOT NULL,
    PRIMARY KEY (surface_id, evidence_id, relationship),
    FOREIGN KEY (surface_id) REFERENCES surfaces(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE surface_research_sources (
    surface_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    research_source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (surface_id, research_source_id),
    FOREIGN KEY (surface_id) REFERENCES surfaces(id),
    FOREIGN KEY (research_source_id) REFERENCES research_sources(id)
);

CREATE TABLE target_models (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    observed_behavior TEXT NULL,
    observed_relationships JSON NULL,
    state_chronology JSON NULL,
    trust_boundaries JSON NULL,
    labeled_assumptions JSON NULL,
    material_unknowns JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT target_models_revision CHECK (revision > 0)
);

CREATE TABLE target_model_surfaces (
    target_model_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    surface_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (target_model_id, surface_id),
    FOREIGN KEY (target_model_id) REFERENCES target_models(id),
    FOREIGN KEY (surface_id) REFERENCES surfaces(id)
);

-- Material claims get rows so supporting/contradicting references are not buried in JSON.
CREATE TABLE target_model_claims (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    target_model_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    claim TEXT NOT NULL,
    claim_kind ENUM('observation', 'assumption', 'inference', 'unknown') NOT NULL,
    context JSON NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (target_model_id) REFERENCES target_models(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT target_model_claims_revision CHECK (revision > 0)
);

CREATE TABLE target_model_claim_evidence (
    target_model_claim_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context') NOT NULL,
    PRIMARY KEY (target_model_claim_id, evidence_id, relationship),
    FOREIGN KEY (target_model_claim_id) REFERENCES target_model_claims(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE approach_families (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mechanism_or_assumption TEXT NOT NULL,
    distinguishing_rationale TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT approach_families_revision CHECK (revision > 0)
);

CREATE TABLE investigations (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    hypothesis TEXT NOT NULL,
    mechanism TEXT NULL,
    input_to_effect_path JSON NULL,
    context JSON NULL,
    outcome ENUM('Untested', 'Blocked', 'Inconclusive', 'Not reproduced', 'Not applicable', 'Validated') NOT NULL,
    assessment TEXT NULL,
    blockers JSON NULL,
    next_action TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT investigations_revision CHECK (revision > 0)
);

CREATE TABLE investigation_approach_families (
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    approach_family_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (investigation_id, approach_family_id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (approach_family_id) REFERENCES approach_families(id)
);

CREATE TABLE investigation_surfaces (
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    surface_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (investigation_id, surface_id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (surface_id) REFERENCES surfaces(id)
);

CREATE TABLE investigation_model_claims (
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_model_claim_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role ENUM('premise', 'subject', 'context') NOT NULL,
    PRIMARY KEY (investigation_id, target_model_claim_id, role),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (target_model_claim_id) REFERENCES target_model_claims(id)
);

CREATE TABLE investigation_research_sources (
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    research_source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    applicability TEXT NULL,
    PRIMARY KEY (investigation_id, research_source_id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (research_source_id) REFERENCES research_sources(id)
);

CREATE TABLE investigation_evidence (
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context') NOT NULL,
    PRIMARY KEY (investigation_id, evidence_id, relationship),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE investigation_propositions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    proposition_kind ENUM('decisive', 'prerequisite', 'competing_explanation') NOT NULL,
    statement TEXT NOT NULL,
    status ENUM('unknown', 'assumed', 'supported', 'refuted', 'conditional') NOT NULL,
    assessment TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT investigation_propositions_revision CHECK (revision > 0)
);

CREATE TABLE investigation_proposition_evidence (
    proposition_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context') NOT NULL,
    PRIMARY KEY (proposition_id, evidence_id, relationship),
    FOREIGN KEY (proposition_id) REFERENCES investigation_propositions(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE experiments (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    hypothesis_tested TEXT NOT NULL,
    baseline JSON NULL,
    controls JSON NULL,
    variations JSON NULL,
    execution_context JSON NULL,
    predicted_signal TEXT NULL,
    execution_state ENUM('planned', 'running', 'finished', 'uncertain') NOT NULL,
    recording_mode ENUM('prospective', 'retrospective') NOT NULL,
    execution_time_notes TEXT NULL,
    conditions_frozen_at DATETIME(6) NULL,
    planned_at DATETIME(6) NULL,
    started_at DATETIME(6) NULL,
    finished_at DATETIME(6) NULL,
    execution_uncertainty TEXT NULL,
    reconciliation_detail TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    executor_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    executor_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    FOREIGN KEY (executor_run_id, executor_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT experiments_revision CHECK (revision > 0),
    CONSTRAINT experiments_executor_pair CHECK ((executor_actor_id IS NULL AND executor_run_id IS NULL) OR (executor_actor_id IS NOT NULL AND executor_run_id IS NOT NULL)),
    CONSTRAINT experiments_frozen CHECK (execution_state = 'planned' OR conditions_frozen_at IS NOT NULL),
    CONSTRAINT experiments_finished CHECK (execution_state <> 'finished' OR finished_at IS NOT NULL OR execution_time_notes IS NOT NULL),
    CONSTRAINT experiments_times CHECK (started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE experiment_test_identities (
    experiment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    test_identity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    context_snapshot JSON NULL,
    PRIMARY KEY (experiment_id, test_identity_id),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id),
    FOREIGN KEY (test_identity_id) REFERENCES test_identities(id)
);

CREATE TABLE experiment_evidence (
    experiment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role ENUM('baseline', 'control', 'variation', 'reproducer_script', 'execution_context', 'result', 'reconciliation') NOT NULL,
    PRIMARY KEY (experiment_id, evidence_id, role),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE observations (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    experiment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    observed_result TEXT NULL,
    measurement JSON NULL,
    tool_transport_failure TEXT NULL,
    observation_kind ENUM('result', 'failure', 'correction', 'reconciliation') NOT NULL,
    observed_at DATETIME(6) NULL,
    context JSON NULL,
    supersedes_observation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recorded_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY observations_experiment (experiment_id, id),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id),
    FOREIGN KEY (experiment_id, supersedes_observation_id) REFERENCES observations(experiment_id, id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT observations_content CHECK (observed_result IS NOT NULL OR measurement IS NOT NULL OR tool_transport_failure IS NOT NULL),
    CONSTRAINT observations_no_self CHECK (supersedes_observation_id IS NULL OR supersedes_observation_id <> id)
);

CREATE TABLE observation_evidence (
    observation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (observation_id, evidence_id),
    FOREIGN KEY (observation_id) REFERENCES observations(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE target_model_claim_observations (
    target_model_claim_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    observation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context') NOT NULL,
    PRIMARY KEY (target_model_claim_id, observation_id, relationship),
    FOREIGN KEY (target_model_claim_id) REFERENCES target_model_claims(id),
    FOREIGN KEY (observation_id) REFERENCES observations(id)
);

CREATE TABLE findings (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assessment TEXT NULL,
    readiness ENUM('incomplete', 'needs_verification', 'disputed', 'ready') NOT NULL,
    readiness_gaps JSON NULL,
    support_revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    report_state ENUM('missing', 'current', 'stale') NOT NULL,
    report_staleness_reason TEXT NULL,
    export_state ENUM('missing', 'current', 'stale', 'conflict', 'uncertain') NOT NULL,
    current_claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    current_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_exported_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_exported_file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_exported_at DATETIME(6) NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT findings_revision CHECK (revision > 0 AND support_revision > 0),
    CONSTRAINT findings_export_metadata CHECK (
        (last_exported_report_revision_id IS NULL AND last_exported_file_sha256 IS NULL AND last_exported_at IS NULL)
        OR (last_exported_report_revision_id IS NOT NULL AND last_exported_file_sha256 IS NOT NULL AND last_exported_at IS NOT NULL)
    ),
    CONSTRAINT findings_report_present CHECK (
        (report_state = 'missing' AND current_report_revision_id IS NULL)
        OR (report_state <> 'missing' AND current_report_revision_id IS NOT NULL)
    ),
    CONSTRAINT findings_current_export CHECK (export_state <> 'current' OR
        (current_report_revision_id IS NOT NULL AND last_exported_report_revision_id IS NOT NULL AND current_report_revision_id = last_exported_report_revision_id AND report_state = 'current'))
);

-- Immutable semantic snapshots. Metadata-only finding updates do not advance claim sequence.
CREATE TABLE finding_claim_revisions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sequence BIGINT UNSIGNED NOT NULL,
    security_violation TEXT NULL,
    mechanism TEXT NULL,
    prerequisites JSON NULL,
    reproduction TEXT NULL,
    demonstrated_impact TEXT NULL,
    conditional_impact TEXT NULL,
    claim_gaps JSON NULL,
    supersedes_claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recorded_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY finding_claim_revisions_owner (finding_id, id),
    UNIQUE KEY finding_claim_revisions_sequence (finding_id, sequence),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (finding_id, supersedes_claim_revision_id) REFERENCES finding_claim_revisions(finding_id, id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT finding_claim_revisions_positive CHECK (sequence > 0),
    CONSTRAINT finding_claim_revisions_no_self CHECK (supersedes_claim_revision_id IS NULL OR supersedes_claim_revision_id <> id)
);

ALTER TABLE findings ADD CONSTRAINT findings_current_claim
    FOREIGN KEY (id, current_claim_revision_id) REFERENCES finding_claim_revisions(finding_id, id);

CREATE TABLE finding_investigations (
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (finding_id, investigation_id),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
);

CREATE TABLE finding_evidence (
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'context', 'reproducer_script') NOT NULL,
    PRIMARY KEY (finding_id, evidence_id, relationship),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE finding_claim_evidence (
    finding_claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    relationship ENUM('supports', 'contradicts', 'prerequisite', 'reproduction', 'impact', 'context') NOT NULL,
    detail TEXT NULL,
    PRIMARY KEY (finding_claim_revision_id, evidence_id, relationship),
    FOREIGN KEY (finding_claim_revision_id) REFERENCES finding_claim_revisions(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

-- Includes originators AND substantial developers; used to assess verifier independence.
CREATE TABLE finding_contributors (
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    contribution ENUM('originator', 'substantial_developer') NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    PRIMARY KEY (finding_id, actor_id, run_id, contribution),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (run_id, actor_id) REFERENCES runs(id, actor_id)
);

CREATE TABLE verifications (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assessed_claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assessed_finding_record_revision BIGINT UNSIGNED NOT NULL,
    originating_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    originating_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    verifying_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    verifying_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    independence_assessment TEXT NULL,
    outcome ENUM('pending', 'confirmed', 'failed', 'inconclusive', 'disputed') NOT NULL,
    assessment TEXT NULL,
    unresolved_disagreements TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (finding_id, assessed_claim_revision_id) REFERENCES finding_claim_revisions(finding_id, id),
    FOREIGN KEY (originating_run_id, originating_actor_id) REFERENCES runs(id, actor_id),
    FOREIGN KEY (verifying_run_id, verifying_actor_id) REFERENCES runs(id, actor_id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT verifications_revisions CHECK (revision > 0 AND assessed_finding_record_revision > 0),
    CONSTRAINT verifications_distinct_actors CHECK (originating_actor_id <> verifying_actor_id)
);

CREATE TABLE verification_experiments (
    verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    experiment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (verification_id, experiment_id),
    FOREIGN KEY (verification_id) REFERENCES verifications(id),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id)
);

CREATE TABLE verification_evidence (
    verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (verification_id, evidence_id),
    FOREIGN KEY (verification_id) REFERENCES verifications(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE report_revisions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    support_revision BIGINT UNSIGNED NOT NULL,
    sequence BIGINT UNSIGNED NOT NULL,
    title TEXT NOT NULL,
    body LONGTEXT NOT NULL,
    owned_fields_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    supporting_checkpoint_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    supersedes_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recorded_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY report_revisions_owner (finding_id, id),
    UNIQUE KEY report_revisions_sequence (finding_id, sequence),
    UNIQUE KEY report_revisions_sync_identity (finding_id, id, owned_fields_sha256),
    FOREIGN KEY (finding_id, claim_revision_id) REFERENCES finding_claim_revisions(finding_id, id),
    FOREIGN KEY (supporting_checkpoint_hash) REFERENCES checkpoints(commit_hash),
    FOREIGN KEY (finding_id, supersedes_report_revision_id) REFERENCES report_revisions(finding_id, id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT report_revisions_positive CHECK (sequence > 0 AND support_revision > 0),
    CONSTRAINT report_revisions_no_self CHECK (supersedes_report_revision_id IS NULL OR supersedes_report_revision_id <> id)
);

ALTER TABLE findings ADD CONSTRAINT findings_current_report
    FOREIGN KEY (id, current_report_revision_id) REFERENCES report_revisions(finding_id, id);
ALTER TABLE findings ADD CONSTRAINT findings_exported_report
    FOREIGN KEY (id, last_exported_report_revision_id) REFERENCES report_revisions(finding_id, id);

CREATE TABLE report_revision_evidence (
    report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role TEXT NULL,
    PRIMARY KEY (report_revision_id, evidence_id),
    FOREIGN KEY (report_revision_id) REFERENCES report_revisions(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

-- A report's supporting checkpoint predates the report. This separate immutable association
-- identifies a confirmed commit containing the report itself and its frozen evidence set.
CREATE TABLE report_checkpoints (
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    checkpoint_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    PRIMARY KEY (finding_id, report_revision_id, checkpoint_hash),
    FOREIGN KEY (finding_id, report_revision_id) REFERENCES report_revisions(finding_id, id),
    FOREIGN KEY (checkpoint_hash) REFERENCES checkpoints(commit_hash)
);

-- Path is deliberately not configurable: exports/<finding-id>.md under this engagement.
CREATE TABLE export_attempts (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    intended_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    intended_file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    previous_file_state ENUM('unknown', 'absent', 'present') NOT NULL,
    previous_file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    observed_file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    result ENUM('prepared', 'uncertain', 'succeeded', 'conflict', 'failed') NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    started_at DATETIME(6) NOT NULL,
    finished_at DATETIME(6) NULL,
    detail TEXT NULL,
    UNIQUE KEY export_attempts_operation (operation_id),
    FOREIGN KEY (operation_id) REFERENCES persistence_operations(id),
    FOREIGN KEY (finding_id, intended_report_revision_id) REFERENCES report_revisions(finding_id, id),
    CONSTRAINT export_attempts_revision CHECK (revision > 0),
    CONSTRAINT export_attempts_previous CHECK ((previous_file_state = 'present' AND previous_file_sha256 IS NOT NULL) OR (previous_file_state <> 'present' AND previous_file_sha256 IS NULL)),
    CONSTRAINT export_attempts_success CHECK (result <> 'succeeded' OR (observed_file_sha256 IS NOT NULL AND observed_file_sha256 = intended_file_sha256 AND finished_at IS NOT NULL))
);

CREATE TABLE caido_links (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_finding_id VARCHAR(255) COLLATE utf8mb4_bin NULL,
    deduplication_identity VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    last_synced_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_synced_checkpoint_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_synced_owned_fields_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_synced_at DATETIME(6) NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY caido_links_finding_project (finding_id, native_project_id),
    UNIQUE KEY caido_links_native (native_project_id, native_finding_id),
    UNIQUE KEY caido_links_deduplication (native_project_id, deduplication_identity),
    UNIQUE KEY caido_links_owner (finding_id, id, native_project_id),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (native_project_id) REFERENCES native_projects(id),
    FOREIGN KEY (finding_id, last_synced_report_revision_id, last_synced_owned_fields_sha256)
        REFERENCES report_revisions(finding_id, id, owned_fields_sha256),
    FOREIGN KEY (finding_id, last_synced_report_revision_id, last_synced_checkpoint_hash)
        REFERENCES report_checkpoints(finding_id, report_revision_id, checkpoint_hash),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT caido_links_revision CHECK (revision > 0),
    CONSTRAINT caido_links_synced_metadata CHECK (
        (last_synced_report_revision_id IS NULL AND last_synced_checkpoint_hash IS NULL AND last_synced_owned_fields_sha256 IS NULL AND last_synced_at IS NULL)
        OR (last_synced_report_revision_id IS NOT NULL AND last_synced_checkpoint_hash IS NOT NULL AND last_synced_owned_fields_sha256 IS NOT NULL AND last_synced_at IS NOT NULL AND native_finding_id IS NOT NULL)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE sync_attempts (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    caido_link_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    native_project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creation_request_reference_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    intended_report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    intended_checkpoint_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    intended_owned_fields_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    previous_remote_state ENUM('unknown', 'absent', 'present') NOT NULL,
    previous_remote_owned_fields_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    target_native_finding_id VARCHAR(255) COLLATE utf8mb4_bin NULL,
    returned_native_finding_id VARCHAR(255) COLLATE utf8mb4_bin NULL,
    observed_owned_fields_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    operation ENUM('create', 'update') NOT NULL,
    result ENUM('prepared', 'uncertain', 'succeeded', 'conflict', 'failed') NOT NULL,
    conflict_detail TEXT NULL,
    uncertainty_detail TEXT NULL,
    error_detail TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    prepared_at DATETIME(6) NOT NULL,
    dispatched_at DATETIME(6) NULL,
    finished_at DATETIME(6) NULL,
    reconciled_at DATETIME(6) NULL,
    UNIQUE KEY sync_attempts_operation (operation_id),
    FOREIGN KEY (operation_id) REFERENCES persistence_operations(id),
    FOREIGN KEY (finding_id, caido_link_id, native_project_id)
        REFERENCES caido_links(finding_id, id, native_project_id),
    FOREIGN KEY (creation_request_reference_id, native_project_id)
        REFERENCES evidence_native_references(id, native_project_id),
    FOREIGN KEY (finding_id, intended_report_revision_id, intended_owned_fields_sha256)
        REFERENCES report_revisions(finding_id, id, owned_fields_sha256),
    FOREIGN KEY (finding_id, intended_report_revision_id, intended_checkpoint_hash)
        REFERENCES report_checkpoints(finding_id, report_revision_id, checkpoint_hash),
    CONSTRAINT sync_attempts_revision CHECK (revision > 0),
    CONSTRAINT sync_attempts_target CHECK (
        (operation = 'create' AND target_native_finding_id IS NULL AND creation_request_reference_id IS NOT NULL)
        OR (operation = 'update' AND target_native_finding_id IS NOT NULL)
    ),
    CONSTRAINT sync_attempts_previous CHECK ((previous_remote_state = 'present' AND previous_remote_owned_fields_sha256 IS NOT NULL) OR (previous_remote_state <> 'present' AND previous_remote_owned_fields_sha256 IS NULL)),
    CONSTRAINT sync_attempts_success CHECK (result <> 'succeeded' OR (observed_owned_fields_sha256 IS NOT NULL AND observed_owned_fields_sha256 = intended_owned_fields_sha256 AND finished_at IS NOT NULL AND (operation <> 'create' OR returned_native_finding_id IS NOT NULL)))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE contradictions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_conflict TEXT NOT NULL,
    context_differences JSON NULL,
    state ENUM('open', 'resolved') NOT NULL,
    next_discriminating_action TEXT NULL,
    current_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT contradictions_revision CHECK (revision > 0),
    CONSTRAINT contradictions_resolution CHECK (state <> 'resolved' OR current_event_id IS NOT NULL)
);

-- Each conflict side is retained as a claim snapshot, optionally naming one exact local record.
-- Explicit nullable typed FKs avoid a polymorphic (table_name, id) reference with no integrity.
CREATE TABLE contradiction_claims (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    contradiction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    claim_snapshot TEXT NOT NULL,
    context_snapshot JSON NULL,
    referenced_record_revision BIGINT UNSIGNED NULL,
    engagement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    surface_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    target_model_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    target_model_claim_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    approach_family_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    investigation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    proposition_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    experiment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    observation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    research_source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    finding_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    finding_claim_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    report_revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    caido_link_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    sync_attempt_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recorded_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    FOREIGN KEY (contradiction_id) REFERENCES contradictions(id),
    FOREIGN KEY (engagement_id) REFERENCES engagements(id),
    FOREIGN KEY (surface_id) REFERENCES surfaces(id),
    FOREIGN KEY (target_model_id) REFERENCES target_models(id),
    FOREIGN KEY (target_model_claim_id) REFERENCES target_model_claims(id),
    FOREIGN KEY (approach_family_id) REFERENCES approach_families(id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
    FOREIGN KEY (proposition_id) REFERENCES investigation_propositions(id),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id),
    FOREIGN KEY (observation_id) REFERENCES observations(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id),
    FOREIGN KEY (research_source_id) REFERENCES research_sources(id),
    FOREIGN KEY (finding_id) REFERENCES findings(id),
    FOREIGN KEY (finding_claim_revision_id) REFERENCES finding_claim_revisions(id),
    FOREIGN KEY (verification_id) REFERENCES verifications(id),
    FOREIGN KEY (report_revision_id) REFERENCES report_revisions(id),
    FOREIGN KEY (caido_link_id) REFERENCES caido_links(id),
    FOREIGN KEY (sync_attempt_id) REFERENCES sync_attempts(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT contradiction_claims_one_reference CHECK (
        (engagement_id IS NOT NULL) + (surface_id IS NOT NULL) + (target_model_id IS NOT NULL)
        + (target_model_claim_id IS NOT NULL) + (approach_family_id IS NOT NULL)
        + (investigation_id IS NOT NULL) + (proposition_id IS NOT NULL) + (experiment_id IS NOT NULL)
        + (observation_id IS NOT NULL) + (evidence_id IS NOT NULL) + (research_source_id IS NOT NULL)
        + (finding_id IS NOT NULL) + (finding_claim_revision_id IS NOT NULL) + (verification_id IS NOT NULL)
        + (report_revision_id IS NOT NULL) + (caido_link_id IS NOT NULL) + (sync_attempt_id IS NOT NULL) <= 1
    ),
    CONSTRAINT contradiction_claims_revision CHECK (referenced_record_revision IS NULL OR referenced_record_revision > 0)
);

CREATE TABLE contradiction_evidence (
    contradiction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role ENUM('original_conflict', 'context') NOT NULL,
    PRIMARY KEY (contradiction_id, evidence_id, role),
    FOREIGN KEY (contradiction_id) REFERENCES contradictions(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

-- Resolution and reopening are append-only events; original claims/context/evidence stay.
CREATE TABLE contradiction_events (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    contradiction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sequence BIGINT UNSIGNED NOT NULL,
    resulting_state ENUM('open', 'resolved') NOT NULL,
    rationale TEXT NOT NULL,
    context JSON NULL,
    occurred_at DATETIME(6) NULL,
    recorded_at DATETIME(6) NOT NULL,
    recorder_actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recorder_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY contradiction_events_sequence (contradiction_id, sequence),
    UNIQUE KEY contradiction_events_state (contradiction_id, id, resulting_state),
    FOREIGN KEY (contradiction_id) REFERENCES contradictions(id),
    FOREIGN KEY (recorder_run_id, recorder_actor_id) REFERENCES runs(id, actor_id),
    CONSTRAINT contradiction_events_positive CHECK (sequence > 0)
);

ALTER TABLE contradictions ADD CONSTRAINT contradictions_current_event
    FOREIGN KEY (id, current_event_id, state) REFERENCES contradiction_events(contradiction_id, id, resulting_state);

CREATE TABLE contradiction_event_evidence (
    contradiction_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    evidence_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (contradiction_event_id, evidence_id),
    FOREIGN KEY (contradiction_event_id) REFERENCES contradiction_events(id),
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE verification_contradictions (
    verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    contradiction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (verification_id, contradiction_id),
    FOREIGN KEY (verification_id) REFERENCES verifications(id),
    FOREIGN KEY (contradiction_id) REFERENCES contradictions(id)
);

-- After all DDL succeeds, the coordinated writer records version 1, this file's actual
-- SHA-256, and the application time in schema_versions. A missing marker is incomplete setup.

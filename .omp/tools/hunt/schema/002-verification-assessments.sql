-- Hunt verification-assessment schema, version 2. Requires completed schema version 1.
-- Keep 001-initial.sql and its installed digest unchanged.
-- Caller must validate the base schema/catalog and explicitly select
-- hunt_<canonical engagement UUID without hyphens>/main before applying this file.
-- DDL is not transactionally rollbackable. Inspect partial setup; never blindly replay it.
-- Record version 2 and this file's actual SHA-256 in schema_versions only after all DDL succeeds.
-- Existing memberships become context, not asserted confirmation proof. Existing completed
-- verifications remain retained; their proof classification requires explicit reviewed
-- supersession rather than an automatic role backfill or in-place history rewrite.

-- Install columns before dependent keys/constraints for Dolt 2.6.2 compatibility.
ALTER TABLE verifications
    ADD COLUMN supersedes_verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN supersession_rationale TEXT NULL;

ALTER TABLE verifications
    ADD UNIQUE KEY verifications_claim_owner (finding_id, assessed_claim_revision_id, id),
    ADD UNIQUE KEY verifications_single_successor (supersedes_verification_id);

ALTER TABLE verifications
    ADD CONSTRAINT verifications_supersedes
        FOREIGN KEY (finding_id, assessed_claim_revision_id, supersedes_verification_id)
        REFERENCES verifications(finding_id, assessed_claim_revision_id, id),
    ADD CONSTRAINT verifications_no_self_supersession
        CHECK (supersedes_verification_id IS NULL OR supersedes_verification_id <> id),
    ADD CONSTRAINT verifications_supersession_pair CHECK (
        (supersedes_verification_id IS NULL AND supersession_rationale IS NULL)
        OR (supersedes_verification_id IS NOT NULL AND supersession_rationale IS NOT NULL
            AND CHAR_LENGTH(TRIM(supersession_rationale)) > 0)
    );

ALTER TABLE verification_experiments
    ADD COLUMN role ENUM('assessment', 'context') NOT NULL DEFAULT 'context';

-- Restore the existing verification foreign key after each primary-key replacement.
ALTER TABLE verification_experiments
    DROP FOREIGN KEY verification_experiments_ibfk_1;

ALTER TABLE verification_experiments
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (verification_id, experiment_id, role);

ALTER TABLE verification_experiments
    ADD CONSTRAINT verification_experiments_ibfk_1
        FOREIGN KEY (verification_id) REFERENCES verifications(id);

ALTER TABLE verification_evidence
    ADD COLUMN role ENUM('assessment', 'context', 'supersession') NOT NULL DEFAULT 'context';

ALTER TABLE verification_evidence
    DROP FOREIGN KEY verification_evidence_ibfk_1;

ALTER TABLE verification_evidence
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (verification_id, evidence_id, role);

ALTER TABLE verification_evidence
    ADD CONSTRAINT verification_evidence_ibfk_1
        FOREIGN KEY (verification_id) REFERENCES verifications(id);

-- Writer contracts beyond SQL FKs/CHECKs:
-- * current assessments are unsuperseded tips for the exact finding/claim;
-- * only a pending, unsuperseded assessment may be finalized in place, on the same run;
-- * completed assessments and all prior memberships are retained;
-- * a new superseding row names an existing tip, making writer-created chains acyclic;
-- * supersession requires new, complete, observation-linked discriminating evidence and
--   rationale, while prior unresolved disagreements/contradictions remain blocking;
-- * only assessment-role evidence/experiments establish current reproduction coverage;
--   retained context and supersession justification are not automatically reproduction proof.

---
name: hunt-record
description: Use when recording or updating engagement context, target models, approach families, hypotheses, experiments, observations, contradictions, verification results, research sources, assessments, and local findings in Dolt.
---

# Hunt Record

MUST read `skill://dolt-access` and `skill://hunt-methodology` unless already in context.

## Responsibility

- MUST maintain canonical engagement, surface, target-model, approach-family, investigation, experiment, observation, contradiction, verification, research-source, and local finding records.
- Artifact preservation, report composition/export, and Caido report synchronization are separate operations. Recording their references does not perform them.

## Resolve existing work

- MUST resolve the engagement and existing linked records before creating new ones.
- SHOULD reuse an investigation for continued testing of the same claim.
- MUST separate materially different claims while retaining their evidence relationships.
- Historical import? MUST identify it as retrospective, retain known event times, and mark missing details unknown.

## Maintain engagement context and target model

- MUST record authorized research scope and report-eligible impact scope
  separately, with each source's meaning, program guidelines, known
  versions/retrieval times, and unresolved conflicts.
- MUST record native-tool project associations explicitly; updating records does not switch tool projects.
- MUST update evidence-linked target models through the shared revision/checkpoint rules, preserving assumptions and material unknowns.
- MUST reuse or create approach families by their distinguishing mechanism or assumption; link investigations rather than copy ledgers.

## Record context and hypotheses

- MUST distinguish observed surface behavior and technology facts from inferred architecture or implementation.
- MUST record attacker control, the security property, input-to-effect path, decisive technical propositions, prerequisite evidence/status, and expected effect for each hypothesis.
- MUST retain decision-relevant parallax results, assumptions, and competing explanations as analysis—not observations or independent corroboration.
- MUST link research sources with their original URLs, collection provenance, relevant dates or versions, and applicability assessment. Published results are not observations of this target.

## Track experiments

- Before execution, MUST save a `planned` experiment with its tested hypothesis, baseline, controls, variations, and predicted distinguishing signal.
- MUST retain relevant identity, state, processing, protocol, runtime, cache, connection, ordering, timing, and observation-window conditions.
- When initiating execution, MUST record `running` and freeze the tested hypothesis and conditions.
- Changed test hypothesis or materially different planned conditions? MUST create a new experiment rather than rewrite the earlier test.
- MUST distinguish planned variations from those actually executed, including partial batches. Retain ordering and result/evidence mappings for sequences and variations.
- MUST mark `finished` only when the experiment is known to have concluded. A request response alone may not complete delayed-effect or observation-window checks.
- Interrupted or lost execution status? MUST record `uncertain` until evidence resolves what ran. Missing results do not establish that execution never happened.

## Record observations

- MUST record directly observed outputs, measurements, or state changes with relevant units, timing, and source references.
- MUST distinguish target behavior from tool or transport failure; keep causal interpretation in the assessment.
- MUST retain contradictory observations and preserve originals when recording corrections.
- MUST read `skill://hunt-evidence` before preserving artifacts or creating or correcting evidence records, unless already in context.
- MUST attach available evidence IDs or precisely scoped source references. Record missing, truncated, or unavailable evidence explicitly.

## Track contradictions

- MUST link conflicting claims/records and evidence with their relevant context differences.
- MUST keep unresolved conflicts open and retain the next discriminating action.
- MUST record resolution rationale/evidence without deleting the original conflict.

## Reassess the investigation

- MUST use the investigation outcome definitions in `hunt-methodology`, separately from experiment execution states.
- MUST assess the claim against relevant evidence and recorded conditions, not merely the latest execution status.
- MUST link each assessment to supporting and contradicting observations, remaining assumptions, and conditional impact.
- A new planned or blocked experiment does not, by itself, overturn a supported assessment.
- MUST update concrete blockers and the next useful action when the assessment changes.

## Maintain local findings

- SHOULD consolidate compatible validated claims into a local finding, linking investigations and evidence rather than duplicating observations.
- MUST retain the security violation, prerequisites, reproduction, demonstrated impact, and readiness gaps. Validation does not mean a report is ready or synchronized.
- Changed supporting assessment? MUST update affected finding readiness and mark its current report/export stale without rewriting immutable report revisions.
- Changed claimed mechanism, prerequisites, or impact? MUST reassess prior verification without rewriting its historical result.
- NEVER treat a local finding update as a Caido mutation or report synchronization.

## Record independent verification

- MUST link verification to the finding and assessed revision, with originating/verifying agent/run provenance.
- MUST link reproduction experiments and evidence; retain actual outcomes, conditions, and unresolved disagreements.
- NEVER record an originator's rerun or narrative endorsement as independent confirmation.
- MUST update finding readiness without erasing investigation assessments or prior verification results.

## Save and return

- MUST persist coherent updates with `hunt` action `save` through `dolt-access`; retain operation IDs, immutable receipts, and the shared checkpoint boundaries.
- MUST distinguish persisted records from unsaved drafts or uncertain writes.
- MUST follow the concise-summary rules in `skill://dolt-access`; summarize
  material record/outcome changes and unresolved blockers or evidence gaps.

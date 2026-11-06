# Shared hunt record contract

## 1. Ownership and storage

- Dolt holds the canonical investigation records and report revisions.
- Caido remains authoritative for scope presets, captured traffic, and native object IDs.
- Program authorization and engagement guidelines define permitted testing; Caido scope presets do not expand that authorization.
- MUST resolve material conflicts between program rules and effective tool scope before affected testing.
- Agent-managed Caido findings contain synchronized report copies, not independent investigation records.
- Use one Dolt database per engagement, accessed through a shared project-local SQL server and persistence implementation.
- Default to the `main` branch in each engagement database; separate agents do not require separate branches.
- Keep runtime databases, configuration, artifacts, and report exports under `.omp/hunts/`. Add an explicit repository ignore rule before creating that data.
- Schemas and skills belong in version-controlled source; engagement data does not. No source commit or remote upload is implicit.
- MUST resolve the engagement ID, database, and native-tool project associations explicitly; NEVER infer them from the current directory or a previous tool call.
- MUST keep canonical investigation state in Dolt; NEVER maintain independent Markdown registries or ledgers as competing records.

Paths below are relative to `.omp/hunts/`. Engagement directories use canonical UUIDs; database names use the same UUID without hyphens.

| Path | Purpose |
|---|---|
| `server/` | Shared SQL-server configuration and private server state |
| `databases/hunt_<uuid-without-hyphens>/` | One engagement's Dolt database |
| `engagements/<engagement-id>/artifacts/sha256/` | Immutable preserved evidence |
| `engagements/<engagement-id>/scripts/` | Reusable engagement-specific investigation harnesses |
| `engagements/<engagement-id>/exports/` | The single report file per finding |
| `engagements/<engagement-id>/work/` | Disposable analysis and processing files |

This layout covers OMP-managed data, not automatic relocation of native Caido/JxScout stores. It provides logical separation, not filesystem access isolation.

## 2. Record model

Use stable UUIDs for local records, UTC timestamps, and recorder/run provenance. Preserve native Caido IDs separately with their instance and project context. Mutable records carry a revision number so stale updates can be detected.

| Record | Required information |
|---|---|
| Engagement | Name, objective, Caido instance/project, native-tool project associations, scope references, authorization/guideline source references with versions or retrieval times, and test-identity labels |
| Surface | Observed features, interfaces, workflows, technology facts/assumptions, and source references |
| Target model | Engagement ID, linked surfaces, observed behavior and relationships, relevant state/chronology, trust boundaries, labeled assumptions, material unknowns, and evidence references |
| Approach family | Engagement ID, underlying mechanism or assumption, distinguishing rationale, and linked investigations |
| Investigation | Hypothesis, approach-family links, mechanism, input-to-effect path, decisive technical propositions, prerequisites with evidence/status, competing explanations, outcome, assessment, blockers, and next action |
| Experiment | Investigation ID, hypothesis tested, baseline, controls, variations, context, predicted signal, execution state, and times |
| Observation | Experiment ID, directly observed result or measurement, tool/transport failures where relevant, and evidence references |
| Contradiction | Engagement ID, conflicting claims/record references, relevant context differences, evidence references, open/resolved state, next discriminating action, and resolution rationale/evidence |
| Evidence | Source, native IDs/variant, capture time, artifact path when preserved, media type, byte count, SHA-256, and original/derived relationship |
| Research source | Original URL, collection provenance, relevant dates/versions, applicability, and linked investigations |
| Finding | Linked investigations/evidence, security violation, prerequisites, reproduction, demonstrated impact, assessment, current report revision, last exported revision/hash, and readiness |
| Verification | Finding ID and assessed revision, originating and verifying agent/run references, reproduction experiment/evidence references, outcome, and unresolved disagreements |
| Report revision | Finding ID, immutable title/body, evidence references, supporting-data checkpoint, and superseded revision |
| Caido link | Local finding ID, Caido instance/project/finding ID, stable deduplication identity, last synchronized report revision, and owned-field hash |
| Sync attempt | Intended report revision/hash, previous remote hash, operation, timestamps, result, and any conflict or uncertain outcome |

Use explicit relationships: approach families and investigations have many-to-many links; one investigation can have several experiments; one finding can combine several investigations; evidence can support several records without duplicating the artifact. Foreign keys protect local relationships. Titles and filenames are not record identities.

Schema versions 1 and 2 are defined in `.omp/tools/hunt/schema/001-initial.sql` and `.omp/tools/hunt/schema/002-verification-assessments.sql`. The coordinated writer records each installed version and its source SHA-256 in `schema_versions` only after successful DDL. A missing marker, mismatched version/digest, or partial catalog is incomplete setup; NEVER silently adopt or recreate an existing database.

The installed writer is the checkout-local `hunt` tool. A completely installed schema with no committed engagement metadata may be initialized only with the exact original operation UUID and request digest recorded during installation. The physical schema must match the native DDL fingerprint captured in that installation marker; initialization recovery and its first checkpoint reject added or altered objects rather than adopting them.

## 3. State and history

- MUST revise the working target model when evidence materially changes target understanding; preserve superseded claims through recorded history.
- MUST link material model claims to supporting or contradicting observations/evidence; inferred implementation remains an assumption.
- MUST group approaches by substantive mechanism or assumptions, not superficial payload or endpoint variations.
- MUST retain competing explanations and distinguish established prerequisites from assumptions.
- MUST preserve material contradictions until evidence resolves them; agent agreement or majority preference is not resolution. Contradictions attached to retained reports or the engagement also invalidate affected finding readiness and report currency.
- MUST retain the original conflict and its evidence when recording a resolution; resolution does not erase the investigation history.
- Reuse the methodology outcomes: Untested, Blocked, Inconclusive, Not reproduced, Not applicable, and Validated.
- MUST use a verifier that did not originate or substantially develop the finding; confirmation requires independently reproducing its load-bearing mechanism, not endorsing another agent's narrative.
- MUST retain completed verification assessments and their evidence. Superseding an assessment requires the same claim, rationale, and discriminating evidence; unresolved disagreements remain readiness gaps.
- Evaluate unsuperseded assessments of the current claim. Missing, failed, inconclusive, or disputed current verification is an explicit finding-readiness gap; NEVER present it as completed independent confirmation.
- MUST reassess verification when the claimed mechanism, prerequisites, or impact changes; prior verification does not automatically cover a changed claim.
- Track experiment execution separately: planned, running, finished, or uncertain. Finished does not mean a vulnerability was validated.
- Freeze the tested hypothesis and conditions when an experiment starts. Record corrections and subsequent observations without erasing what was originally recorded. Current confirmation and validation exclude superseded observations; a current correction containing actual results may supply proof.
- On interruption, reconcile uncertain execution using available evidence; never automatically repeat a potentially completed test.
- Keep each report revision’s title, body, evidence set, and supporting checkpoint immutable. Track current readiness/staleness on the finding; changed report content creates a new revision.
- Mark affected reports stale when their supporting assessment changes. Reports distinguish verified impact from explicitly conditional statements.

## 4. Saving and checkpointing

Use SQL transactions for coherent record updates, with a coordinated writer per engagement. Detect stale revisions rather than silently overwriting another agent's work.

Use `hunt` for initialization, semantic record batches, inspection, checkpoints, and persistence resumption. Preserve operation UUIDs and immutable receipts. Identical input under an existing operation UUID returns the recorded outcome; different input is rejected. Unexpected working changes or native history require inspection rather than automatic repair.

Use one managed local Dolt server for these database files. Stop and await the existing launcher before replacing it; concurrent or unverified server replacement is not a supported recovery mechanism.

Create Dolt checkpoints after material target-model updates, meaningful experiment results, or assessment changes, and before report synchronization or handoff. Record supporting-data checkpoints on reports and the synchronized report revision/checkpoint on the Caido link.

A SQL transaction commit and a Dolt history commit are different operations. A failed checkpoint must not be reported as successful history preservation, and a storage failure must not trigger re-execution of the target test. Dolt commits are separate from committing OMP source code.

## 5. Evidence preservation

- Keep ordinary traffic history in Caido. Preserve the selected exchanges and other artifacts needed to support the investigation and report.
- Store preserved bytes as immutable, content-addressed files; register provenance and SHA-256 in Dolt. Redactions and transformed views are separate artifacts linked to their originals.
- MUST preserve exact reproducer script versions and relevant execution context when they support a finding; a mutable script path alone is insufficient.
- Finish and verify an artifact write before registering it as preserved. Filesystem writes and SQL transactions are not one atomic operation.
- Use `hunt` action `preserve` to copy a selected local file and register new or revision-checked existing evidence. Its artifact result, SQL receipt, and checkpoint confirmation are separate outcomes; native-store acquisition and relocation are not implicit.
- A Caido reference alone is not a durable local copy. Record missing, truncated, or unavailable evidence explicitly.
- Test identities are labels and role/tenant context, not a credentials inventory. Captures may contain secrets and remain private.

## 6. Caido report synchronization

For an agent-managed finding, the report title and the entire description are generated from Dolt. There is no unmanaged section inside that description. Visibility and other native fields remain outside report synchronization.

Store the last synchronized report revision/checkpoint and SHA-256 of the exact synchronized title/description. Read the current finding before updating it. Detected divergence becomes a conflict to reconcile; it is neither blindly overwritten nor automatically adopted as canonical content.

Before any Caido mutation, persist the intended revision/hash and target in a sync attempt. Use a partial GraphQL update containing only title and description. Read back the saved fields and record success only when the intended content is confirmed. A timeout, missing response, or mismatch remains an unresolved outcome until reconciled; do not blindly repeat the mutation.

For initial creation, inspect existing findings, use a stable engagement/finding-based deduplication identity, and retain the returned finding ID. Do not automatically adopt unrelated existing findings or recreate a missing linked finding. Deduplication is not an update or exactly-once guarantee.

Saving in Caido is not submitting a report to a bug-bounty program. References in the description are not a complete attachment bundle.

## 7. Concurrency limitation

The inspected Caido GraphQL update accepts optional title, description, and hidden fields, but exposes no revision or compare-and-swap precondition. The high-level SDK update requires all three fields, so report-only synchronization should use the partial GraphQL mutation.

The operating model is coordinated single-writer access to the generated title/description during synchronization. This coordinates agent writers; it does not lock out a person editing Caido independently. Hash checks detect observed divergence but cannot prevent a concurrent edit between reading and writing. Do not claim race-free synchronization against uncontrolled external writers. The installed instance's schema must be checked before enabling writes.

## 8. Resumption and backup

Resume from Dolt records and preserved artifacts, including the working target model, active approach families, unresolved contradictions, pending verification, unfinished experiments, stale reports/exports, and unresolved sync attempts—not from conversation summaries alone.

A recoverable backup includes Dolt database state, required configuration, and the artifact files. A branch push does not cover every working set or external file. Use supported backup procedures; do not copy a live database directory as though that guaranteed a consistent snapshot.

## 9. Final report file

- MUST use `.omp/hunts/engagements/<engagement-id>/exports/<finding-id>.md` as the single report-file path for each finding.
- MUST use `hunt` action `export` with the current finding revision and nonstale report revision. Update the same file; historical revisions remain in Dolt.
- NEVER create separate draft/submitted directories, timestamped copies, or per-revision report files.
- The writer persists the export intent before publication, then verifies bytes before recording the exported revision/hash. SQL persistence, file verification, and checkpoint confirmation are separate outcomes.
- Matching canonical bytes need confirmation, not rewriting. Otherwise, replacement requires the last exported hash to match; unexpected changes require reconciliation. The final snapshot check is optimistic, not filesystem CAS against uncontrolled external editors.
- Identical-request replay never writes the file or changes the original receipt. Prepared-export `resume` reads back and flushes existing bytes, records the outcome, and checkpoints; missing or altered files are not repaired.
- MUST report missing or stale exports and incomplete reports explicitly; NEVER present them as current, submission-ready files.

## References

- [Dolt commit semantics](https://www.dolthub.com/docs/sql-reference/version-control/dolt-sql-procedures#dolt_commit)
- [Inspected Caido GraphQL update input](https://github.com/caido/sdk-js/blob/2f75aeabd70239abea908a0326ff3b2007e4d3ea/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts#L5464-L5473)
- [Caido SDK finding update implementation](https://github.com/caido/sdk-js/blob/2f75aeabd70239abea908a0326ff3b2007e4d3ea/packages/sdk-client/src/sdks/finding.ts#L120-L128)
- [Dolt backup guarantees and limitations](https://www.dolthub.com/docs/sql-reference/server/backups)

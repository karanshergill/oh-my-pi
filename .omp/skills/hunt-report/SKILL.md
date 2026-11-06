---
name: hunt-report
description: Use when composing or revising evidence-backed hunt reports, saving immutable report revisions, synchronizing them into Caido Findings, or updating the single report file for a finding. Keep canonical records, remote copies, and program submission distinct.
---

# Hunt Report

MUST read `skill://dolt-access` and `skill://hunt-record` unless already in context.

## Responsibility

- MUST keep the canonical report and its revisions in Dolt. Agent-managed Caido findings contain synchronized copies of the entire title and description, with no unmanaged section inside the description.
- MUST distinguish drafting, revising, synchronizing, exporting, and submitting. Completing one does not establish completion of the others.
- Missing proof requires investigation work, not invented report content. New target tests remain separate operations governed by `hunt-methodology`.

## Resolve sources and readiness

- MUST resolve the engagement, local finding, linked investigations, verification results, evidence, current report revision, last export state, and any existing Caido link before writing.
- MUST use current supported assessments and preserve the conditions under which results were observed. Inferred implementation details are not established root causes.
- MUST check that independent verification supports the current mechanism, prerequisites, and claimed impact; unresolved verification remains a readiness gap.
- MUST verify demonstrated impact against the engagement's report-eligible
  impact scope before marking a report ready. Authorized supporting assets
  may appear in evidence without being independently reportable.
- MUST read `skill://hunt-evidence` before verifying supporting artifacts or producing redacted derivatives.
- MUST retain material controls, contradictory results, prerequisites, and unresolved limitations. A draft can record gaps; it MUST NOT present them as completed validation.
- MUST distinguish investigation validation, independent confirmation, report readiness, export freshness, and Caido synchronization. Stale or incomplete reports MUST NOT be silently presented as current, ready reports.

## Compose the report

MUST use a supplied program template when available. Otherwise, use the structure below without inventing missing facts.

| Section | Required content |
|---|---|
| Title and summary | The demonstrated issue and affected context, without overstating the mechanism or impact |
| Affected surface and prerequisites | Relevant assets, interfaces, identities or roles, state, versions when known, and required access or configuration |
| Reproduction | Ordered steps and inputs, baseline or controls, relevant execution conditions, and the distinguishing result |
| Expected versus observed behavior | The security property and the actual violation, with evidence references |
| Demonstrated impact | Supported consequences; conditional escalation and untested chain links identified separately |
| Evidence and limitations | Traceable artifact/source references, material counterevidence, coverage limits, and unresolved gaps |

- MUST distinguish tested inputs from explanatory examples or redacted templates. Preserve meaningful encoding, ordering, timing, and processing context.
- MUST keep credentials and unnecessary sensitive data out of report text. Redactions use separate derivatives; originals remain unchanged.
- When severity or CVSS is requested, MUST identify the applicable scheme, assumptions, and justification. A proposed rating is not a program-accepted rating.
- Remediation advice MAY be included when relevant or requested; MUST distinguish recommendations from verified knowledge of the implementation.

## Save an immutable revision

- MUST bind the report to its supporting record revisions, evidence set, and an actual supporting-data checkpoint through the shared persistence implementation.
- MUST save the title, body, evidence references, supporting checkpoint, and superseded revision immutably. Changes to those saved values require a new report revision.
- MUST maintain current-report selection and readiness on the finding, with revision checks. Changed supporting assessments require reassessment rather than silently treating an older report as current.
- MAY reuse an unchanged valid revision. A synchronization retry or an unrelated new Dolt commit does not by itself require another report revision.
- MUST obtain a checkpoint containing the saved report before synchronization or handoff. The supporting-data checkpoint and the checkpoint containing the report are distinct references.

## Prepare Caido synchronization

- MUST read `skill://caido-findings` before native finding operations and verify the installed instance supports the required update contract.
- MUST select the intended immutable report revision and its readiness explicitly. Draft or stale content MUST NOT be represented as a current validated report.
- For creation, MUST resolve a real, relevant captured request ID, including a related handshake or baseline where appropriate. Missing genuine association is a synchronization prerequisite, not permission to invent an ID or attach an unrelated request.
- MUST inspect existing findings, use the stable engagement/finding-based deduplication identity, and retain the native finding ID. A new report revision is not a new finding identity.
- MUST read an existing linked finding before updating it. Missing links or ambiguous creation outcomes require reconciliation; NEVER automatically adopt unrelated findings or recreate a missing linked finding.
- MUST compare owned title/description fields with the intended content and last synchronized state using the shared serialization/hash convention. Already matching content needs confirmation, not another mutation; unexplained divergence is a conflict.

## Synchronize and confirm

- Before any Caido mutation, MUST persist the intended report revision/hash, target or creation identity, previous remote state, and operation in a sync attempt. Failed intent persistence means the mutation does not proceed.
- MUST use the coordinated writer and shared checkpoint boundaries. Hash checks detect observed divergence; they do not prevent concurrent external edits, and the inspected Caido update exposes no revision/CAS precondition.
- For report-only updates, MUST use partial GraphQL `updateFinding` input containing only `title` and `description`. Visibility and other native fields remain outside report synchronization.
- MUST inspect mutation errors and read back the saved owned fields. Record confirmation only when the intended content is observed; a successful transport response alone is insufficient.
- MUST retain the confirmed report revision/checkpoint and owned-field hash on the Caido link, preserving sync-attempt history and newer local revisions.
- Timeout, missing response, mismatch, or failed local confirmation storage? MUST preserve the known stage outcomes and reconcile before any further mutation. NEVER blindly retry creation or update.

## Export and submission boundaries

- When export is requested, MUST call `hunt` action `export` with engagement/operation IDs, `finding={id,revision}`, and the current nonstale `reportRevisionId`. The tool owns the stable path and canonical serialization; NEVER write the report file separately.
- MUST update that file; NEVER create draft/submitted directories or timestamped/per-revision report copies.
- Matching canonical bytes are verified without rewriting. Otherwise, replacement requires the last exported hash to match; unexpected edits, unsafe paths, or permissions require reconciliation.
- The writer persists a detailed export intent before publication and confirms the exported revision/hash only after byte verification. File success, SQL persistence, and checkpoint confirmation are distinct; failure does not undo the saved Dolt report.
- Interrupted export? MUST inspect its operation. Identical-input replay only observes; `resume` reconciles a prepared attempt from existing bytes without publishing. Missing or changed files are not restored.
- MUST identify the included artifact set. Local paths, Caido IDs, and description links are not automatically accessible attachments.
- MUST distinguish shareable redacted material from private originals and report missing attachments or essential redaction limits. A native Findings export is not automatically a complete evidence bundle.
- Program submission is a separate explicitly requested operation. Drafting, saving in Dolt, synchronizing to Caido, or exporting files does not submit the report.

## Return

- MUST follow the concise-summary rules in `skill://dolt-access`.
- MUST report readiness and material limitations, distinguishing persistence,
  file export, and Caido synchronization outcomes. Surface conflicts and
  uncertain stages; include the stable report path when delivering an export.
- NEVER imply program submission without an actual submission result.

---
name: caido-findings
description: Inspect, create, update, hide, restore, delete, export, and import Caido findings. Maintain request associations, evidence, and deduplication while distinguishing recorded findings from validated vulnerabilities.
---

# Caido Findings

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage finding records and their supporting evidence.
- Creating a finding does not prove that a vulnerability exists.
- Use `skill://caido-requests` when additional request inspection or
  execution is needed.
- Saving a finding is not submitting a bug-bounty report.
- For agent-managed hunt report content, MUST read `skill://hunt-report`
  unless already in context; Dolt remains canonical.

## SDK operations

| Operation | SDK |
|---|---|
| List findings | `client.finding.list()` |
| Read a finding | `client.finding.get(id)` |
| Create a finding | `client.finding.create(requestId, options)` |
| Update all three supported fields together | `client.finding.update(id, options)` |
| Delete selected findings | `client.finding.delete({ ids })` |
| Delete a reporter's findings | `client.finding.delete({ reporter })` |
| Delete all findings | `client.finding.delete()` |

## GraphQL operations

| Operation | GraphQL |
|---|---|
| Update selected finding fields | `updateFinding(id, input)` |
| Export selected findings | `exportFindings(input: { ids })` |
| Export by reporter | `exportFindings(input: { filter: { reporter } })` |
| Import a native Findings file | `importData(input: { findings: { file } })` |

- The inspected SDK has no high-level Findings export/import methods.
- Export selection and file import belong here; use `skill://caido-exports`
  for authenticated, byte-preserving artifact downloads.

## Locate and inspect

- Paginate with `.first(n)` and the returned `.next()`.
- Filter by reporter with `.filter({ reporter })` when appropriate.
- Finding filters are structured inputs, not HTTPQL strings.
- Resolve mutations by finding ID; titles are not unique identifiers.
- Inspect the associated request, reporter, description, deduplication key,
  and hidden state.
- Distinguish a missing finding from one absent from a filtered listing.
- Do not equate hidden findings with deleted findings.

## Prepare evidence

- Associate the finding with an actual captured request ID.
- A Replay session or entry ID is not a request ID.
- Choose the exchange that best demonstrates the observation.
- Record baseline and supporting request IDs in the description.
- Include relevant Replay session/collection references for multi-step cases.
- Describe prerequisites, account/role context, reproduction steps,
  expected behavior, observed behavior, and demonstrated impact.
- Separate reproduced behavior from hypotheses and unresolved questions.
- Do not promote a status-code difference or scanner label into a
  confirmed vulnerability without supporting evidence.

## Create and deduplicate

- Supply a descriptive title and a consistent reporter label.
- Use `omp` for agent-created findings unless another reporter is specified.
- Inspect existing findings before creating another record for the same issue.
- Use a stable `dedupeKey` for repeated observations of the same issue.
- Do not use changing timestamps or request IDs as the deduplication
  identity for repeated observations.
- Do not collapse distinct issues merely because their host or path matches.
- Deduplication can suppress duplicate alerts; do not assume that creating
  with the same key updates or merges an existing finding.
- Use an explicit update when adding evidence to an existing record.
- Retain the finding ID returned by creation.

## Update

- Read the latest finding before editing.
- The typed SDK update requires `title`, `description`, and `hidden`;
  its helper passes all three fields through.
- The inspected GraphQL `UpdateFindingInput` makes those fields optional.
  MUST verify the installed schema before using partial updates.
- For field-limited updates, MUST use partial GraphQL input containing
  only the intended fields. Omission is not interchangeable with null.
- The inspected update has no revision/CAS precondition; read-before-write
  checks do not exclude concurrent external changes.
- MUST inspect `updateFinding.error` and read back the requested fields.
- Retain useful evidence when adding reproduction details or corrections.
- The SDK update operation does not expose changes to `requestId`,
  `reporter`, or `dedupeKey`.
- NEVER silently delete and recreate a record to simulate an unsupported
  field update.

## Hide or restore

- For visibility-only changes, MUST use GraphQL
  `updateFinding(id, input: { hidden })`.
- Set `hidden` to true to hide, or false to restore; omit title/description.
- Hiding does not mean an issue was fixed, rejected, or deleted.
- Record assessment conclusions in the description rather than using
  visibility as a substitute for validation state.

## Describe assessment state

- The SDK does not expose dedicated severity, CVSS, or workflow-status fields.
- Record those details in the description when needed; do not invent API fields.
- Label unconfirmed observations explicitly.
- Explain any severity assessment using demonstrated impact.
- A saved record and a successfully reproduced vulnerability are different outcomes.

## Export

- Resolve the intended finding IDs or reporter filter before exporting.
- Supply exactly one selector branch, `ids` or `filter`, not both.
- Finding IDs are not captured-request IDs.
- The verified filter contains only `reporter`; NEVER pass HTTPQL,
  `scopeId`, or an invented hidden-state filter.
- A reporter filter is not a selection of the currently visible rows.
  Use explicit finding IDs when only a subset is intended.
- An empty selection means no selected findings; NEVER broaden it to
  an empty filter. Treat an empty filter as a project-wide selection.
- The operation has no verified `format` or `includeRaw` setting.
- Inspect `exportFindings.error` before using its optional `export`.
- The result is a `DataExportOnDemand`, not a stored-export task.
  Retain its ID and `downloadUri`, then download through `caido-exports`.
- Verify the downloaded artifact represents the intended findings.
- Preserve Caido's native artifact bytes. Serializing SDK list results
  does not establish a compatible import file.
- NEVER assume every supporting request, Replay session, or description
  reference is embedded in the export. Inspect the artifact's contents.
- An export is neither a full project backup nor a bounty submission.

## Import

- Identify the source artifact and intended destination project.
- Use the native Findings file through
  `importData(input: { findings: { file } })`.
- `file` is an `Upload`; use the authenticated client's upload transport,
  not a Base64 `Blob`, local path string, or hosted-file ID.
- NEVER substitute a generic request export or hand-built finding list
  without a verified compatible file contract.
- Preserve the source artifact and inspect relevant destination findings
  before import so additions and collisions can be assessed.
- Inspect the returned `errors` array and optional `summary`.
- Read `findingsImported` through the `FindingsSummary` fragment;
  a missing summary is not a reported count of zero.
- The result's `id` is not a finding ID or a generic task handle.
- Errors may accompany partial results. NEVER assume atomic rollback
  or automatically repeat an import after an uncertain outcome.
- Re-read imported records and their request associations. NEVER assume
  source IDs survive, deduplication suppresses every duplicate, or
  existing records are merged or overwritten.
- Check title, reporter, description, hidden state, deduplication data,
  and available evidence against the source artifact.
- Report unresolved references or missing evidence rather than fabricating
  replacement captures.
- Importing a finding does not reproduce or revalidate its observation.

## Delete

- For selected findings, pass their exact IDs.
- An empty selection means nothing to delete; do not replace it with
  a call lacking arguments.
- Reporter-based deletion affects that reporter's findings, not merely
  the rows currently visible in a listing.
- Calling `client.finding.delete()` without arguments deletes all findings.
- Use that form only when clearing all findings is the intended operation.
- Do not delete captured traffic or Replay sessions as part of finding cleanup.

## Verify and return

- Creation → retrieve the returned ID and check its request association,
  title, reporter, description, and deduplication key.
- Update → check the requested changes and preservation of unrelated fields.
- Hide/restore → check the resulting `hidden` value.
- Deletion → confirm the targeted findings are absent.
- Export → selector, export ID, downloaded artifact location, and
  observed contents or unresolved coverage.
- Import → source artifact, destination project, result ID, reported
  imported count, observed finding/request IDs, and all returned errors.
- Report finding IDs, titles, reporter, associated request IDs, visibility,
  and the actual changes.
- State whether the underlying observation was reproduced, remains
  unconfirmed, or was not reassessed during this operation.

## References

- Findings overview: https://docs.caido.io/app/quickstart/findings
- Client namespace: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/client.ts
- Finding SDK: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/finding.ts
- Finding types: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/types/finding.ts
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts
- Inspected update input: https://github.com/caido/sdk-js/blob/2f75aeabd70239abea908a0326ff3b2007e4d3ea/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts#L5464-L5473
- Inspected SDK update: https://github.com/caido/sdk-js/blob/2f75aeabd70239abea908a0326ff3b2007e4d3ea/packages/sdk-client/src/sdks/finding.ts#L120-L138

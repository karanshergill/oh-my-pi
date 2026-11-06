---
name: caido-automate
description: Configure and run Caido Automate payload campaigns. Manage sessions, placeholders, payload combinations, preprocessing, execution controls, extractors, results, and supported exports.
---

# Caido Automate

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage payload-driven HTTP testing through Caido Automate.
- Use `skill://caido-requests` to inspect seed requests and resulting exchanges.
- Session preparation does not authorize an implicit campaign start.
- Keep reusable sessions, run entries, and running tasks distinct.
- The inspected external SDK has no `client.automate` wrapper.

## GraphQL operations

| Operation | GraphQL |
|---|---|
| List sessions | `automateSessions` |
| Read a session | `automateSession(id)` |
| Read a run entry | `automateEntry(id)` |
| List running tasks | `automateTasks` |
| Create a session | `createAutomateSession(input)` |
| Update a session | `updateAutomateSession(id, input)` |
| Duplicate a session | `duplicateAutomateSession(id)` |
| Rename a session | `renameAutomateSession(id, name)` |
| Rename a run entry | `renameAutomateEntry(id, name)` |
| Start a run | `startAutomateTask(automateSessionId)` |
| Pause a run | `pauseAutomateTask(id)` |
| Resume a run | `resumeAutomateTask(id)` |
| Cancel a run | `cancelAutomateTask(id)` |
| Test an extractor | `testExtractor(input)` |
| Delete run entries | `deleteAutomateEntries(ids)` |
| Delete a session | `deleteAutomateSession(id)` |
| Export session results | `exportAutomateEntries(input)` |

## Locate and prepare

- Resolve sessions by ID or an unambiguous name.
- Paginate session and task listings using their connection cursors.
- Create from a captured request with `requestSource: { id }`.
- Raw sources require the corresponding connection information.
- Preserve the seed exchange and identify its authentication context.
- Read the latest session before changing its configuration.
- Updates require `connection`, `raw`, and the complete `settings` input.
- Preserve unrelated payloads, preprocessors, extractors, and execution settings.
- Rebuild input unions explicitly; returned objects are not mutation inputs.
- Editing a session does not rewrite evidence from existing run entries.
- NEVER assume a session edit reconfigures an already-running task.

## Placeholders and payloads

- Placeholders use `{ start, end }` ranges in the raw request.
- NEVER calculate ranges from prettified content or the Base64 transport string.
- Recalculate affected ranges when request edits move their contents.
- Keep payload-set assignments aligned with the intended placeholders.
- Select exactly one payload source per payload configuration:

| Source | Configuration |
|---|---|
| Inline list | `simpleList: { list }` |
| Hosted wordlist | `hostedFile: { id, delimiter }` |
| Numbers | `number: { range, increments, minLength }` |
| Repetition without values | `null: { quantity }` |

- Resolve hosted-file IDs rather than passing a local path as an ID.
- Preserve intended empty values, delimiters, and numeric zero-padding.
- Use a zero-width placeholder for unchanged-request repetition.
- NEVER confuse a null payload source with an empty literal payload.

## Combination strategies

| Strategy | Behavior |
|---|---|
| `ALL` | One payload set; place each value in every placeholder together. |
| `SEQUENTIAL` | One payload set; vary one placeholder at a time, preserving the others. |
| `PARALLEL` | Pair corresponding values across sets; sets must have equal counts. |
| `MATRIX` | Generate all combinations across the payload sets. |

- Calculate the intended combinations before starting the run.
- Preserve the selected strategy; NEVER silently truncate or pad payload sets.
- `PARALLEL` is a payload-combination strategy, not synchronized race testing.
- Use Replay pipelines for supported last-byte or single-packet synchronization.

## Preprocessors and extractors

- Preprocessors run in their configured order.
- Supported preprocessor families are prefix, suffix, URL encoding, and workflow.
- Preserve the URL-encoding charset and non-ASCII behavior.
- Resolve referenced workflows before binding them.
- Binding a workflow does not create or modify its definition.
- Preprocessors may require an eligible Caido subscription.
- Regex extractors specify `regex`, `body`, and optional `workflowId`.
- Test through `testExtractor({ extractor, testInput })`.
- `testInput` and returned extracts are GraphQL `Blob` values.
- Check matching and nonmatching response content.
- An extractor test does not establish a vulnerability or validate a whole campaign.

## Execution settings

- Preserve or explicitly set workers and delay in milliseconds.
- Preserve redirect strategy/limit and retry count/backoff.
- Preserve connection-closing and content-length behavior.
- NEVER silently repair deliberately malformed request lengths.
- Payload combinations and actual network requests are different counts:
  redirects and retries can produce additional traffic.
- Account for active Match & Replace rules when interpreting sent requests.
- NEVER add arbitrary concurrency or payload limits absent from the task.

## Start and control

- Starting returns an Automate task and its associated run entry.
- Retain the session, task, and entry IDs separately.
- Pass the task ID to pause, resume, or cancel.
- Use Automate's dedicated control mutations, not an assumed generic equivalent.
- Verify the resulting paused/running state.
- A missing start acknowledgement can leave a campaign running;
  inspect tasks and entries before attempting another start.
- Cancelling does not undo requests already processed by the target.

## Observe and inspect results

- Observe `createdAutomateEntryRequest` and `updatedAutomateTask` when monitoring.
- `deletedAutomateTask` carries terminal status and an optional error.
- NEVER interpret disappearance from the active-task list as successful completion.
- Retrieve results through the run entry's `requests` or `requestsByOffset`.
- These result queries support HTTPQL filtering, ordering, and pagination.
- Keep filters consistent while paging or comparing results.
- Retain each row's `sequenceId`, payload positions, request ID, extracts, and error.
- Concurrent completion order is not payload order.
- Inspect actual request/response content for anomalies.
- Separate failed exchanges, absent responses, and completed negative results.
- Samples and filtered rows are not complete campaign totals.
- NEVER rerun a campaign merely to recover an uncertain completion status.

## Export or delete

- Where supported, export with `exportAutomateEntries`.
- Its input selects `sessions` by session ID, not arbitrary entry IDs.
- Supply the intended export settings and retrieve the returned download URI.
- Delete only the identified session or run-entry IDs.
- NEVER use record deletion as a substitute for cancelling execution.
- Check running tasks before deletion and verify the resulting records/state.
- NEVER assume deleting a session preserves its associated run history.

## Verify and return

- Configuration → retrieve the session and compare the intended changes.
- Start/control → report the observed task state and associated run entry.
- Completion → report the observed terminal status and errors, or uncertainty.
- Results → report inspected coverage, payload/request associations, and evidence.
- Deletion/export → verify the requested records or generated artifact.
- Distinguish prepared, running, paused, cancelled, completed, and failed work.
- NEVER report campaign success from configuration persistence alone.

## References

- Automate: https://docs.caido.io/app/quickstart/automate
- Payload strategies: https://docs.caido.io/app/guides/automate_multiple
- Null payloads: https://docs.caido.io/app/guides/automate_null
- Preprocessors: https://docs.caido.io/app/guides/automate_preprocessors
- Extractors: https://docs.caido.io/app/guides/automate_extractors
- Execution pacing: https://docs.caido.io/app/guides/automate_rate_limiting
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts

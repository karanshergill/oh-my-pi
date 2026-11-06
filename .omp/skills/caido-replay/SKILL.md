---
name: caido-replay
description: Manage Caido Replay sessions, saved drafts, settings, histories, and collections. Prepare and execute HTTP pipelines using sequential, Last Byte Synchronization, or Single Packet Attack strategies.
---

# Caido Replay

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage saved Replay work; execute pipelines only as an execution operation.
- Creating, naming, moving, ranking, or saving a draft does not send traffic.
- Use `skill://caido-requests` for ordinary proxied HTTP tests and exchange
  comparison. Use Replay for selected-request handoff, byte-sensitive or
  Caido-specific execution, and pipelines.
- Use `skill://caido-websockets` for WebSocket drafts and execution.

## Locate sessions and collections

- List sessions and collections before resolving names.
- Paginate with `.first(n)` and the returned `.next()`.
- Resolve by ID or an unambiguous name; return candidates when ambiguous.
- Use IDs for mutations; retain names for human-readable references.
- Read collection membership and the session's concrete GraphQL `__typename`.
- Distinguish `ReplaySessionHttp`, `ReplaySessionHttpPipeline`, and
  `ReplaySessionWs`; their operation kinds are `HTTP`, `HTTP_PIPELINE`,
  and `WS`.
- Preserve the active-entry reference when exposed by the target API.
- NEVER infer the active entry from list position or the newest timestamp.
- SDK session objects are snapshots; retrieve current state before editing.

## SDK operations

| Operation | SDK |
|---|---|
| List sessions | `client.replay.sessions.list()` |
| Read a session | `client.replay.sessions.get(id)` |
| Create a session | `client.replay.sessions.create(options)` |
| Rename a session | `client.replay.sessions.rename(id, name)` |
| Move a session | `client.replay.sessions.move(id, collectionId)` |
| Delete sessions | `client.replay.sessions.delete(ids)` |
| List session history | `session.entries()` |
| Read a history entry | `client.replay.entries.get(id)` |
| List collections | `client.replay.collections.list()` |
| Create a collection | `client.replay.collections.create({ name })` |
| Rename a collection | `client.replay.collections.rename(id, name)` |
| Delete a collection | `client.replay.collections.delete(id)` |

## GraphQL operations

| Operation | GraphQL |
|---|---|
| Read a typed session | `replaySession(id)` with concrete-type fragments |
| Read a typed entry | `replayEntry(id, sessionKind)` |
| Read a collection | `replaySessionCollection(id)` |
| Save an entry draft | `updateReplayEntryDraft(id, input)` |
| Clear an entry draft | `clearReplayEntryDraft(id, kind)` |
| Update session settings | `updateReplaySessionSettings(id, input)` |
| Create an HTTP pipeline | `createReplayPipelineHttpSession(input)` |
| Change pipeline membership/order | `updateReplayEntryHttpPipelineDraftHttpEntries(id, input)` |
| Select a pipeline's HTTP child | `setActiveReplayPipelineEntryHttpEntry(id, httpEntryId)` |
| Rank a session | `rankReplaySession(id, input)` |
| Rank a collection | `rankReplaySessionCollection(id, input)` |
| Start execution | `startReplayTask(sessionId)` |
| Cancel execution | `cancelTask(id)` |

- The inspected SDK creates HTTP sessions and reads entries with
  `sessionKind: "HTTP"`. Use GraphQL for pipeline and WebSocket shapes.
- Select fields through matching fragments; NEVER read HTTP-only fields
  from a pipeline or WebSocket entry.
- The current schema deprecates `setActiveReplaySessionEntry` with no
  replacement. NEVER treat its SDK wrapper as the current selection API.
- Browsing a historical entry is not proof that it became the next
  execution input. For a separate case, create a session from the chosen
  capture or preserved raw input rather than guessing selection state.

## Prepare sessions

- For a captured request, use `requestSource: { id: requestId }`.
- Pass the intended `collectionId` when assigning the new session.
- Session creation and naming are separate SDK operations.
- Name the created session with `sessions.rename(...)`.
- For raw input, preserve the request bytes and connection information.
- Direct GraphQL uses `requestSource: { raw: { connectionInfo, raw } }`;
  the inner `raw` is a Base64 `Blob`.
- The inspected SDK session-creation wrapper accepts
  `requestSource: { raw, connection }` and forwards its raw string
  without encoding. This differs from `client.replay.send()`, which
  encodes supplied request bytes.
- When creating a raw Replay session through that wrapper, Base64-encode
  the intended bytes first (for UTF-8 text:
  `Buffer.from(raw, "utf8").toString("base64")`).
- Pass unencoded request text to `client.replay.send()`; it performs its
  own encoding. Do not pass the Base64 session input as send raw.
- Preserve placeholder settings explicitly when cloning an input;
  creating from a captured request does not establish those settings.
- Do not send a request merely to save or organize it.
- Reuse an intended existing session rather than creating accidental duplicates.
- Preserve saved baselines when preparing separate test cases.
- Name sessions by their purpose; distinguish baselines from modified cases.
- Give multi-request reproductions ordered, descriptive step names.

## Inspect history

- Read history through the selected session's `entries()` builder.
- Use `.includeRaw(false)` for metadata-only browsing.
- Retrieve the required entry when raw payloads are needed.
- Distinguish Replay input from the recorded request and response.
- An entry can exist without a completed request/response exchange.
- Report execution errors and absent responses explicitly.
- Historical entries do not establish the contents of an unsent editor draft.
- Preserve entry and request IDs when referring to a particular result.
- For pipelines, read the parent's `httpEntries` and each child's
  `request`, `error`, raw input, connection, settings, and draft.
- Pipeline entry IDs, child HTTP entry IDs, captured request IDs, and
  task IDs are separate handles.
- Paginate session history; the current pipeline `httpEntries` field
  is an array, not a separately paginated connection.

## Save drafts and settings

- Read the selected entry and its draft before mutation.
- For an HTTP draft, use `updateReplayEntryDraft` with the `http` branch.
  Its input requires `connection`, `editorState`, `raw`, and `settings`.
- `raw` and `editorState` are separate `Blob` fields. Preserve opaque
  editor state or use the target version's serialization contract;
  NEVER reconstruct it from Pretty formatting.
- Preserve all intended placeholders in `settings.placeholders`;
  an empty array removes them.
- Use `clearReplayEntryDraft(id, kind)` to discard the identified draft.
  Re-read it; NEVER substitute deletion of the session or captured request.
- Session settings are separate from entry drafts. Update them through
  `updateReplaySessionSettings` using exactly one matching input branch.
- HTTP settings include `connectionClose`, `updateContentLength`, and
  `stripHttp2ConnectionHeaders`; preserve unrelated values.
- Pipeline session settings include `strategy`, `updateContentLength`,
  and `stripHttp2ConnectionHeaders`.
- A pipeline entry's draft contains its own `settings.strategy`.
  Change that through `updateReplayEntryDraft` with `httpPipeline`.
- Read both entry-level and session-level settings; NEVER assume changing
  one rewrites the other or retroactively changes historical results.
- Inspect returned nullable entries/sessions and re-read saved state;
  these draft/settings payloads have no verified nested `error` field.

## HTTP pipelines

### Build and edit

- Create with `createReplayPipelineHttpSession` using `requestSources`,
  pipeline `settings`, and the intended optional `collectionId`.
- Each source is either `{ id: requestId }` or a raw request source.
  NEVER substitute a Replay entry ID for a captured request ID.
- Inspect the creation payload's `error` before using its `session`.
- Read pipeline parents with `sessionKind: "HTTP_PIPELINE"` and inspect
  their nested HTTP children.
- Change children through
  `updateReplayEntryHttpPipelineDraftHttpEntries(id, { operations })`,
  where `id` identifies the pipeline entry.
- Supported operations are `ADD`, `RANK`, and `REMOVE`. Use
  `requestSource` for additions, `httpEntryId` to identify existing
  children, and `rank` for ordering.
- `RankInput` uses `beforeId` or `afterId`; NEVER invent numeric ranks.
- Re-read the child list after edits and preserve the intended sequence.
- Edit each child's HTTP draft separately when changing its request.
- `setActiveReplayPipelineEntryHttpEntry` selects an existing child;
  verify membership and returned `activeHttpEntry`. It does not send it.
- No in-place session-to-pipeline conversion mutation is verified.
  Create a new pipeline from the chosen sources and retain the original
  sessions unless their deletion is separately intended.
- Removing a pipeline child or clearing a pipeline draft is not proof
  that its captured requests or other drafts were deleted.

### Choose a strategy

| Strategy input branch | Required controls | Behavior |
|---|---|---|
| `sequential` | `abortOnFailure` | Sends requests in the specified order |
| `lastByteSynchronization` | `failureBehavior` | Synchronizes the final byte of requests |
| `singlePacketAttack` | `convertToHttp2`, `failureBehavior` | Uses one HTTP/2 connection for synchronized final request parts |

- Supply exactly one strategy branch.
- `failureBehavior` accepts `ABORT_ON_PARTIAL` or `FIRE_ON_PARTIAL`;
  choose partial-group behavior deliberately.
- Single Packet Attack requires Caido's HTTP/2 stack. The official
  guide labels that stack experimental and potentially unstable.
- Use `caido-proxy` for a requested stack change; NEVER silently change
  instance-wide networking to make a pipeline run.
- Preserve intentional framing, conversion, and header-stripping choices.
- Concurrent SDK calls or Automate's `PARALLEL` payload mode do not
  implement these synchronization strategies.

### Execute and inspect

- Verify the intended session, current execution input, child sequence,
  and effective settings before starting.
- Subscribe to `finishedTask` before `startReplayTask(sessionId)`;
  correlate by the returned task ID.
- Inspect the start payload's `error`, then retain the task's
  `sessionKind` and `replayEntry` reference.
- Completion reports `DONE`, `ERROR`, or `CANCELLED`, with an optional
  error. Task creation alone is not successful execution.
- Inspect the resulting pipeline entry and every child exchange;
  report transport failures and absent responses individually.
- A completed task or timing difference does not establish a race
  vulnerability; verify the observed application-state effect.
- Cancel with the task ID through `cancelTask`; inspect its `error`
  and `cancelledId`, then observe the terminal result.
- Cancellation cannot undo requests already sent or application effects.
- If completion events are lost, inspect current `tasks` and persisted
  entries. NEVER automatically rerun a state-changing pipeline.

## Organize

- Rename or move only the identified sessions or collections.
- A move changes collection membership; it must not resend the request.
- Use GraphQL ranking operations for ordering within the appropriate
  collection or collection list; inspect payload errors and resulting order.
- Create collections for meaningful groupings, not merely because a
  request was inspected.
- Preserve unrelated sessions, entries, and collection membership.

## Delete

- Resolve the exact session IDs or collection ID before deletion.
- Inspect a collection's contained sessions before deleting it.
- Do not assume collection deletion preserves its sessions.
- NEVER independently delete child sessions as an implicit preparation
  step for deleting a collection.
- Deleting saved Replay work is not a substitute for cancelling its
  running task, nor proof that all linked traffic evidence was erased.

## Verify and return

- Creation → retrieve the session and check its name and collection.
- Rename → check the resulting name.
- Move → check the resulting `collectionId`.
- Draft/settings changes → re-read the exact entry and session fields.
- Pipeline changes → report parent and child IDs, order, and strategy.
- Pipeline execution → report task status, parent/child entry IDs,
  captured request IDs, errors, and observed application effects.
- Ranking → verify the resulting relative order.
- Session deletion → confirm the specified sessions are absent.
- Collection changes → re-list collections and check the affected IDs.
- Report session/collection names and IDs, relevant entry/request IDs,
  and the actual metadata changes.
- Distinguish prepared Replay work from requests that were executed.

## References

- Replay overview: https://docs.caido.io/app/quickstart/replay
- Sessions: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replaySession.ts
- Collections: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replayCollection.ts
- Entries: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replayEntry.ts
- Pipeline strategies: https://docs.caido.io/app/guides/replay_test_race_conditions
- Sending and task completion: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replay.ts
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts

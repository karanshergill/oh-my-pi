---
name: caido-websockets
description: Inspect and search Caido WebSocket traffic, read message edit history, manage WebSocket Replay connections and drafts, send messages, and remove selected captured messages.
---

# Caido WebSockets

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Own WebSocket stream/message inspection and Replay connection operations.
- Use `skill://caido-intercept` for queued-message forwarding or dropping.
- Use `skill://caido-rewrite` for automatic WebSocket Match & Replace rules.
- Use `skill://caido-filters` for saved StreamQL presets.
- Stream IDs, message IDs, edit IDs, Replay entry IDs, and task IDs differ.
- The inspected high-level Replay helpers support HTTP, not WebSocket sending.
- NEVER present an HTTP-only SDK call as a WebSocket operation.

## GraphQL operations

| Operation | GraphQL |
|---|---|
| List streams | `streams`, `streamsByOffset` |
| Read a stream | `stream(id)` |
| List messages in a stream | `streamWsMessages`, `streamWsMessagesByOffset` |
| Read a message | `streamWsMessage(id)` |
| Read a message version | `streamWsMessageEdit(id)` |
| Create a WebSocket Replay session | `createReplaySession(input)` |
| Establish a Replay connection | `startReplayTask(sessionId)` |
| Send a message | `sendReplayTaskMessage(task, input)` |
| Save a message draft | `updateReplayEntryDraft(id, input)` |
| Send the saved draft | `sendReplayTaskMessageDraft(task)` |
| Stop selected Replay connections | `stopReplayWsTasks(taskIds)` |
| Delete captured messages | `startDeleteStreamWsMessageTask(input)` |

## Find and read traffic

- Resolve the intended stream from its host, path, port, TLS, and source.
- Inspect `protocol`; the stream API also represents SSE.
- NEVER apply WebSocket message operations to an SSE stream.
- Stream listings accept `scopeId`; resolve scope through `caido-scope`.
- Use StreamQL through `filter: { code }`, not an HTTPQL request query.
- Message listings require a `streamId`.
- Keep stream, scope, filters, and ordering consistent while paginating.
- Apply the intended message filter when retrieving messages from a stream.
- NEVER treat a matching stream as proof that every contained message matches.
- Use StreamQL's documented value spelling, not assumed GraphQL enum casing.
- Preserve message direction, format, length, and version identity.
- `head` contains the current message version; `edits` identifies other versions.
- Read the chosen edit by ID rather than assuming array position identifies it.
- NEVER label the current head as original without checking its alteration history.
- Decode `raw` as bytes; decode text only when the format/encoding permits it.
- Preserve binary messages without lossy text conversion.

## Prepare a Replay connection

- Create with `kind: WS`, not the HTTP-only SDK creation helper.
- Supply an appropriate captured upgrade request or raw request source.
- A historical stream ID is not a request-source ID.
- Preserve transport host, port, TLS, and intended handshake headers.
- Preserve the required authentication and subprotocol context.
- Creating a saved session and establishing a connection are separate operations.
- Start the session through `startReplayTask`.
- Retain the returned Replay task and entry IDs.
- Inspect the WebSocket entry's `http` handshake result and associated stream.
- Verify connection establishment before treating message sending as available.
- A historical stream does not establish a live, writable Replay connection.
- NEVER claim this API injects into an arbitrary existing browser connection.

## Send or resend a message

- Call `sendReplayTaskMessage` with the live Replay task ID.
- Its input is `ws: { data, direction, format }`.
- `data` is a GraphQL `Blob`; follow the shared encoding guidance.
- Pass message content, not a reconstructed HTTP request.
- Select the intended `CLIENT` or `SERVER` direction.
- Preserve direction when resending an existing message unless changing it is intended.
- Supported format values include `TEXT`, `BINARY`, `CLOSE`, `PING`, and `PONG`.
- Control messages can affect connection state; they are not ordinary text messages.
- Preserve bytes unrelated to the requested mutation.
- Inspect the returned message and operation error.
- Verify the actual captured outgoing content and relevant subsequent messages.
- A send acknowledgement does not establish an application-level effect.
- NEVER silently reconnect and resend after an uncertain send outcome.

## Save or send a draft

- Read the current WebSocket Replay entry and draft before editing.
- Update through the `ws` branch of `updateReplayEntryDraft`.
- The input requires direction, format, raw content, editor state, and settings.
- Preserve unrelated editor state and connection/session settings.
- Follow the target version's editor-state encoding rather than inventing it.
- `settings.serverTimeoutMs` is a timeout value in milliseconds.
- Saving a draft does not send it.
- Send the stored draft only through the intended live Replay task.
- Report whether the content was saved, sent, or both.

## Observe and stop

- Use supported stream/message and Replay-entry subscriptions for live observation.
- Relevant events include `createdStream`, `createdStreamWsMessage`,
  `updatedStreamWsMessage`, and `updatedReplayEntryWs`.
- Reconcile observed messages with the correct stream and task.
- A connection error, closed connection, and empty result page are different outcomes.
- Stop only the identified Replay task IDs.
- Observe terminal task state; absence alone is not proof of successful completion.
- Stopping a connection does not undo messages already processed.
- Preserve captured history unless its deletion was requested.

## Captured-message deletion and project settings

- Delete captured messages with `startDeleteStreamWsMessageTask({ ids })`.
- Track the deletion task and verify the intended message records afterward.
- Deleting history is not dropping a queued message or closing a connection.
- The project setting `stripExtension` is exposed through `setProjectConfigStream`.
- Treat that as a separate project-level configuration change, not a message-send option.
- Preserve it during unrelated history or Replay operations.
- Verify project configuration readback when a setting change is intended.

## Verify and return

- Search/read → report stream/message/edit IDs and inspected coverage.
- Connect → report session/task/entry/stream IDs and the observed handshake result.
- Send → report message ID, direction, format, actual content changes, and observed effects.
- Draft → verify saved values separately from transmission.
- Stop/delete → report acknowledged actions and verified resulting state.
- Identify partial results, missing messages, and unresolved delivery/completion.
- NEVER equate a saved session, draft, or API acknowledgement with a successful test.

## References

- WS History: https://docs.caido.io/app/quickstart/ws_history
- WebSocket Replay: https://docs.caido.io/app/guides/replay_websocket
- StreamQL: https://docs.caido.io/app/reference/streamql
- HTTP-only Replay helper: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replay.ts
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts

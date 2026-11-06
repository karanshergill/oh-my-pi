---
name: caido-intercept
description: Control Caido's live HTTP and WebSocket interception. Inspect and configure interception state, read pending messages, forward unchanged or edited traffic, and drop selected messages.
---

# Caido Intercept

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage live traffic waiting in Caido's interception queue.
- Captured history and pending messages are different resources.
- Use `skill://caido-requests` for captured HTTP exchanges.
- Automatic Match & Replace rules are separate from queue handling.
- Copying a request into Replay does not forward its pending message.

## GraphQL operations

These are GraphQL fields, not methods on `client.intercept`.

| Operation | GraphQL |
|---|---|
| Read global status | `interceptStatus` |
| Read interception options | `interceptOptions` |
| Change global state | `pauseIntercept`, `resumeIntercept` |
| Update interception options | `setInterceptOptions(input)` |
| Read pending messages | `interceptMessages(kind, first, after)` |
| Forward unchanged | `forwardInterceptMessage(id)` |
| Edit and forward | `forwardInterceptMessage(id, input)` |
| Drop | `dropInterceptMessage(id)` |

For live monitoring, use the supported subscriptions:
`createdInterceptMessage`, `deletedInterceptMessage`,
`updatedInterceptOptions`, and `updatedInterceptStatus`.

## Inspect and configure

- Read the current status and options before changing them.
- Global status is `PAUSED` or `RUNNING`.
- Global status and per-message-type `enabled` flags are separate controls.
- Use the global-state mutations only when changing global behavior.
- NEVER substitute a global state change for forwarding selected messages.
- `setInterceptOptions` requires `request`, `response`, and `streamWs`.
- Preserve unrelated type flags, filters, and scope selection.
- HTTP request and response options contain `enabled` and optional `filter`.
- Filters are structured `QueryInput` values, not bare query strings.
- Preserve each existing filter's query kind and expression.
- The inspected WebSocket option exposes `enabled`, not a message filter.
- NEVER invent a WebSocket filter field from StreamQL history support.
- Scope selection uses `scope: { scopeId }`.
- Use `skill://caido-scope` to resolve or modify the scope preset.
- Check the queue before and after configuration changes.
- NEVER assume a state change preserves or drains already queued messages.

## Read pending messages

- Query each intended message kind explicitly:
  `REQUEST`, `RESPONSE`, or `STREAM_WS`.
- Paginate with `first` and `after`, following `pageInfo`.
- Queue listing does not accept HTTPQL or scope arguments.
- Interception options determine selection; listing arguments are separate.
- Select subtype fields using GraphQL fragments:

| Kind | Message subtype | Captured content |
|---|---|---|
| `REQUEST` | `InterceptRequestMessage` | `request` |
| `RESPONSE` | `InterceptResponseMessage` | `request`, `response` |
| `STREAM_WS` | `InterceptStreamWsMessage` | `message` |

- Retain the queue message ID separately from nested resource IDs.
- HTTP content is available through the request/response `raw` fields.
- WebSocket content is available through `message.head.raw`.
- Decode binary fields without treating arbitrary bytes as UTF-8 text.
- A queue listing is a snapshot; messages can arrive or leave afterward.
- Snapshot the selected IDs before a batch action.
- Include later arrivals only when continuous processing is intended.

## Forward unchanged

- Identify the current pending message and its kind.
- Pass its interception message ID, not its request or stream message ID.
- Omit `input` when forwarding without changes.
- NEVER reconstruct unchanged traffic from a formatted preview.
- A missing message is no longer queued; its final outcome may be unknown.
- NEVER substitute a Replay send for a consumed queue message.

## Edit and forward

- Read the original raw bytes before constructing the modification.
- Preserve bytes unrelated to the requested change.
- Supply exactly one input branch matching the pending message kind:

| Kind | Forward input |
|---|---|
| HTTP request | `request: { updateRaw, updateContentLength }` |
| HTTP response | `response: { updateRaw, updateContentLength }` |
| WebSocket message | `streamWs: { updateRaw }` |

- `updateRaw` is a GraphQL `Blob`; follow the shared encoding guidance.
- Choose `updateContentLength` deliberately.
- Preserve a deliberately mismatched length when that is the test.
- The WebSocket branch has no content-length, direction, or format field.
- Editing through this operation also forwards the message.
- There is no separate persistent queue-edit mutation in the inspected API.
- NEVER claim an unsent edit was saved by calling the forwarding mutation.

## Drop

- Call `dropInterceptMessage` with the selected interception message ID.
- Deleting a captured entry is not dropping a pending message.
- Dropping a response does not undo server processing of its request.
- For batch actions, report each ID's acknowledged or unresolved outcome.

## Verify and return

- Configuration → re-read status and options; compare the intended changes.
- Forward → check that `forwardedId` matches the selected message ID.
- Drop → check that `droppedId` matches the selected message ID.
- A missing acknowledgement is not proof of success.
- Re-query the relevant queue after forwarding or dropping.
- Queue absence alone does not prove which client performed the action.
- Inspect captured original/modified traffic when verifying an edit.
- Distinguish forwarding acknowledgement from successful delivery or impact.
- Report affected message IDs, kinds, related capture IDs, and actual changes.
- Report final global status, enabled message types, and remaining queued work.

## References

- Interception: https://docs.caido.io/app/guides/intercept_traffic
- External GraphQL client: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/graphql/client.ts
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts

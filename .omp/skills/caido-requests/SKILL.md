---
name: caido-requests
description: Search and manage Caido HTTP history, inspect original and edited exchanges, update color metadata, create stored exchanges, send requests with preprocessing, render responses, and compare results.
---

# Caido Requests

MUST read `skill://caido-access` unless its guidance is already available in context.

## Operations

- Search, read, and compare existing captures without sending traffic.
- Send ordinary HTTP probes through Caido's proxy with an HTTP client,
  including the dedicated MCP browser for interactive flows; confirm the exchange in HTTP History.
- Use Replay when the test needs raw-byte control or Caido-specific execution.
- Creating a stored exchange does not send traffic.
- Use `caido-intercept` for queued traffic and `caido-websockets` for WebSockets.
- Use `caido-replay` for saved drafts, session organization, and pipelines.

| Operation | SDK or GraphQL |
|---|---|
| Search stored exchanges | `client.request.list()` |
| Read an exchange | `client.request.get(id)` |
| Send ordinary HTTP | HTTP client through the Caido proxy listener |
| Prepare a Replay execution session | `client.replay.sessions.create(options)` |
| Send via Replay | `client.replay.send(sessionId, { connection, raw, settings })` |
| Read edit variants | GraphQL `request(id)` with request/response `edits` |
| Read HTTP History rows | GraphQL `interceptEntries` or `interceptEntry(id)` |
| Update color metadata | GraphQL `updateRequestMetadata(id, input)` |
| Create a stored exchange | GraphQL `createRequest(input)` |
| Render a captured response | GraphQL `renderRequest(id, input)` |
| Delete one HTTP History row | GraphQL `deleteInterceptEntry(id)` |
| Delete matching HTTP History rows | GraphQL `deleteInterceptEntries(filter, scopeId)` |

## Search

- Build HTTPQL queries with `.filter(httpql)`.
- For scope-specific searches, apply `.scope(scopeId)`.
- Resolve scope presets through `caido-scope`; do not approximate them
  with hostname substring matching.
- Quote string values; leave integer values unquoted.
- Use `ne`, `ncont`, `nlike`, or `nregex` for negation.
- Parenthesize combined conditions to make grouping explicit.
- For newest requests, use `.descending("req", "id")`.
- Use `.includeRaw(false)` when browsing metadata.
- Fetch a page with `.first(n)`; continue with the returned `.next()`.
- Preserve the query, scope, and ordering across pagination.
- Distinguish an exhausted result set from a partially inspected one.
- Do not collapse requests solely by path; method, host, parameters,
  body format, and authentication context may distinguish useful cases.

## Read

- Retrieve the selected exchange by request ID.
- `undefined` from `get(id)` means the request was not found.
- An existing request can have no response; report that separately.
- Fetch raw payloads before reconstructing or modifying a request.
- Preserve original bytes; decoded text is an inspection view.
- Identify the method, target, headers, body format, and account context.
- Distinguish omitted or truncated payloads from empty payloads.
- Keep the original exchange as the baseline for comparisons.

### Original and edited exchanges

- Query request and response `edited`, `alteration`, and `edits` through
  GraphQL when the SDK projection omits them.
- Keep each variant's ID, timestamps, and raw bytes separate.
- NEVER assume the first or last edit is the original or final variant.
- Select the intended variant explicitly before comparing or resending.
- The current schema returns edit arrays, not paginated connections.
- NEVER invent `parent` or `head` fields from another API version.
- Pretty formatting is an inspection view, not the transmitted bytes.

## Color metadata

- Read the selected request's `metadata` before updating it.
- The verified `UpdateRequestMetadataInput` contains only `color`.
- Resolve the target version's mutation ID contract before writing;
  NEVER assume request IDs and metadata IDs are interchangeable.
- Use `updateRequestMetadata(id, input: { color })` and re-read the
  selected request to verify the persisted color.
- The payload exposes nullable `metadata` and `snapshot`; it has no
  verified nested `error` field.
- Clearing a color requires the target API's documented null semantics;
  NEVER substitute an arbitrary empty string.
- NEVER invent notes or tags in this mutation.
- MUST use `skill://hunt-record` for canonical hunt records;
  use `skill://caido-findings` for native finding operations.

## Create a stored exchange

- Use this operation to store supplied HTTP data, not to send a request.
- The current GraphQL input requires `host`, `isTls`, `method`, `path`,
  `port`, `query`, `raw`, and `source`; `sni` and `response` are optional.
- A supplied response contains `raw`, `roundtripTime`, and `statusCode`.
- Keep metadata consistent with the supplied bytes and actual provenance.
- NEVER fabricate a response, measurement, or captured-traffic origin.
- Direct GraphQL request and response `raw` values are `Blob` fields.
- The current payload returns `id` and optional `responseId`;
  retrieve those records to verify persistence.
- The inspected SDK `request.create()` hardcodes `isTls: false` and uses
  an older input/payload contract. Use it only when its implementation
  preserves every required field and matches the target version.
- NEVER treat a stored record as evidence that traffic reached a target.

## Send or resend

- Prepare the transport connection separately from the HTTP Host header.
- Preserve the intended host, port, TLS, and SNI settings.
- Start from the selected capture when modifying an existing request.
- Change only the intended request elements.
- Preserve authentication, cookies, CSRF values, and content type unless
  changing them is part of the test.
- Preserve path encoding, duplicate headers, and body bytes where relevant.

### Routine requests through Caido's proxy

- Identify the proxy listener using `skill://caido-proxy`; API reachability
  and listener configuration alone do not prove target traffic is captured.
- Configure the chosen client to proxy HTTP and HTTPS through that listener.
  Account for `NO_PROXY` when applicable; for Chrome use `skill://hunt-browser`.
- HTTPS interception requires the client to trust this instance's public
  `/ca.crt` explicitly (for example, curl's `--cacert`). If trust is not
  configured, HTTPS proxying is not ready; do not disable TLS verification
  or silently change the system trust store.
- Use a transport that preserves significant path encoding and request
  bytes. Use Replay if client or proxy normalization would alter the test.
- Confirm the first authorized request and subsequent material exchanges
  in Caido HTTP History. Correlate request and response IDs; a client
  response alone does not prove capture.

### Replay-specific settings

- Choose `settings.updateContentLength` deliberately; do not silently
  repair framing that is intentionally being tested.
- Choose `settings.connectionClose` deliberately when connection reuse
  affects the experiment.

### Placeholders and preprocessing

- SDK send options support `settings.placeholders`.
- Each placeholder contains `inputRange`, `outputRange`, and an ordered
  `preprocessors` array.
- Each preprocessor contains `options` with exactly one supported branch:
  `environment`, `workflow`, `prefix`, `suffix`, or `urlEncode`.
- Environment preprocessing uses `variableName`; workflow preprocessing
  uses the workflow `id`.
- Resolve environment selection through `caido-environments` and Convert
  workflow behavior through `caido-workflows`.
- Arbitrary `{{name}}` text does not establish an environment placeholder.
- Build ranges against the intended raw request using the target API's
  range convention, not Base64 text or Pretty formatting.
- Recompute affected ranges after changing raw content.
- Preserve preprocessor order and inspect the resulting captured request.
- The inspected SDK replaces draft placeholders with the supplied array,
  or an empty array when omitted. Preserve existing placeholders
  explicitly when that is the intended operation.

### Replay execution session

- `client.replay.send()` requires a Replay session; ordinary proxied
  requests do not.
- Use the specified session, or create a dedicated execution session.
- Creating a session is preparation, not proof that traffic was sent.
- Sending can change that session's draft, history, and settings.
- NEVER silently reuse an unrelated saved session.
- Keep collection organization and broader session lifecycle management
  separate from request execution.
- The inspected SDK sender supports HTTP sessions, not WebSocket or
  HTTP pipeline sessions.
- Use `caido-replay` for sequential or synchronized HTTP pipelines.
  Concurrent SDK calls are not Last Byte Synchronization or a Single
  Packet Attack.

### Result handling

- For proxied requests, inspect the client error/status and the matching
  HTTP History exchange. If capture cannot be confirmed, do not claim the
  request passed through Caido.
- For Replay, await `client.replay.send(...)` and inspect its status,
  error, and entry.
- Retrieve the resulting captured exchange rather than assuming the
  submitted draft exactly matches the transmitted request.
- Missing responses and transport errors are not HTTP status codes.
- A timeout does not prove that the server performed no action.
- Inspect available results before retrying a state-changing request.
- Recheck the baseline before treating a 401/403 as expired credentials.

## Native response rendering

- Use GraphQL `renderRequest(id, input: { width, height })` when an image
  of a captured response is needed.
- This invokes Caido's rendering API; it is not GUI operation or request
  placeholder expansion.
- Inspect the payload's `error` before consuming its `render` image.
- Report `NO_BROWSER`, `NO_DATA`, `TIMEOUT`, or `INTERNAL` distinctly.
- A missing browser is a rendering prerequisite, not permission to
  install one or launch the Caido GUI.
- Verify the target version's browser isolation and resource-loading
  behavior before treating rendering as a passive operation.
- Preserve the source request ID and image result. A rendered image
  alone does not prove browser exploitability.

## HTTP History management

- HTTP History rows are `InterceptEntry` objects containing their own
  `id` and a `request`. Retain both IDs.
- Query `interceptEntries` with HTTPQL `filter: { code }`, `scopeId`,
  ordering, and cursor pagination when row identity matters.
- History-row IDs, captured-request IDs, and live interceptor queue IDs
  are different handles; NEVER substitute one for another.
- Delete one row with `deleteInterceptEntry(id)` using its entry ID.
  Inspect `userError` and the returned `deletedId`.
- Bulk deletion accepts `filter` and `scopeId`, not an array of IDs.
  Preview the same selection before `deleteInterceptEntries`.
- An unfiltered, unscoped deletion targets the whole project's history;
  NEVER use it as a fallback for a failed narrower selection.
- Bulk deletion returns a task or `userError`. Subscribe before starting
  and correlate `startedDeleteInterceptEntriesTask`,
  `updatedDeleteInterceptEntriesTask`, and
  `finishedDeleteInterceptEntriesTask` by task ID.
- Track `task.deletedEntryIds`; inspect the finished payload's `error`
  before reporting completion.
- A failed task may have deleted some rows; report observed partial
  results rather than assuming rollback.
- NEVER invent a cancellation method for this dedicated task.
- History deletion is not dropping queued traffic, deleting Replay
  sessions, or proof that all referenced request data was erased.
- Use `caido-exports` when preserving an export is part of the operation.

## Compare

- Identify the baseline and candidate exchanges explicitly.
- Compare response status, relevant headers, body content, and observed
  application effects.
- Account for differing authentication, CSRF state, caches, and redirects.
- Separate volatile values from meaningful differences without altering
  the preserved evidence.
- A status, length, or timing difference alone does not establish impact.
- State the observed difference and any unresolved explanation.

## Return

- Search → query, scope, ordering, request summaries, and pagination state.
- Read → request ID, target, request/response details, and missing data.
- Send → baseline ID when applicable, intended changes, execution status,
  resulting request ID, and HTTP History or Replay references as applicable.
- Compare → paired request IDs, meaningful differences, and uncertainties.
- Variants → original/selected variant IDs, alterations, and preserved bytes.
- Metadata → request ID, resolved mutation ID, and observed color change.
- Store → provenance, created request/response IDs, and no-send distinction.
- Render → request ID, dimensions, image reference, or rendering error.
- Delete → exact selection, history-entry IDs, task ID when present,
  deleted IDs, and any partial result or error.

## References

- Request extraction: https://developer.caido.io/client-sdk/guides/extract_requests.html
- HTTPQL: https://docs.caido.io/app/reference/httpql
- Replay sending: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replay.ts
- Replay sessions: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/replaySession.ts
- Request SDK: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/request.ts
- Original and edited traffic: https://docs.caido.io/app/guides/http_history_modifications
- Raw and Pretty views: https://docs.caido.io/app/guides/request_response_modes
- Replay placeholders: https://docs.caido.io/app/guides/replay_environment_variables
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts

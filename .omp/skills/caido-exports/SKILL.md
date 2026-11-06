---
name: caido-exports
description: Create, inspect, download, rename, cancel, and delete Caido data exports. Preserve export selections, distinguish stored and on-demand artifacts, and verify downloaded evidence.
---

# Caido exports

MUST read `skill://caido-access` unless its guidance is already available in context.

## Operations

Use GraphQL for export management. There is no verified high-level
`client.exports` namespace.

| Operation | GraphQL field | Arguments |
|---|---|---|
| List exports | `dataExports` | None |
| Read an export | `dataExport` | `id` |
| Export HTTP requests | `startExportRequestsTask` | `input` |
| Cancel an export task | `cancelTask` | Task `id` |
| Rename an export | `renameDataExport` | Export `id`, `name` |
| Delete an export | `deleteDataExport` | Export `id` |

- `dataExports` returns an array, not a paginated connection.
- Export IDs and task IDs are different identifiers. Retain both when
  starting an export task.
- Request `__typename` and use inline fragments for concrete export
  fields. The common `DataExport` interface exposes only `id`.

## Export kinds

- `DataExportStored` includes `name`, `format`, `path`, `size`,
  `createdAt`, `status`, optional `error`, and optional `downloadUri`.
- Stored export statuses are `PROCESSING`, `DONE`, `ERROR`, and
  `CANCELLED`.
- `DataExportOnDemand` includes `id` and `downloadUri`. It does not
  expose the stored export's status, name, or filesystem metadata.
- Do not assume an on-demand export has a background task, persistent
  listing, or the same lifecycle as a stored export.
- A Caido-side storage `path` is not the agent's local destination
  and is not a substitute for a download URI.

## Request selection

`startExportRequestsTask` accepts:

- `format`: `JSON` or `CSV`.
- `includeRaw`: whether raw request/response data is requested.
- Optional `filter: { code }`: an HTTPQL expression.
- Optional `scopeId`: the intended scope preset.

- Resolve and preserve the requested selection before starting.
  Use `skill://caido-requests`, `skill://caido-filters`, and
  `skill://caido-scope` as needed.
- Do not assume a GUI table selection, active filter, or selected scope
  is inherited by the API call.
- This input has no arbitrary request-ID array. Express a requested
  selection through supported filtering or its source-specific export
  operation rather than inventing an `ids` argument.
- Do not remove a filter or scope merely to make a failed export
  succeed; that changes the evidence being exported.
- Caido documents plan restrictions for exporting current rows.
  Report observed permission or plan failures rather than treating
  them as an empty result.
- Record the effective selector and export creation context. Do not
  promise a particular snapshot boundary without verifying it.

## Task lifecycle

- Inspect `startExportRequestsTask.error` before using its optional
  `task`.
- Retain `task.id` and `task.export.id`.
- When waiting through events, establish the subscription early and
  correlate `finishedTask` by the returned task ID.
- Use the stored export's status and error to distinguish completed,
  failed, cancelled, and still-processing work.
- A task disappearing from a task list is not proof of success.
- For cancellation, call `cancelTask` with the task ID and inspect
  `error` and `cancelledId`. Verify the resulting terminal state.
- Do not use export deletion as a substitute for task cancellation.
- Export creation, task completion, and downloading the artifact are
  separate outcomes. Report them separately.

## Source-specific exports

Use the owning skill to select and create these artifacts:

- `skill://caido-sitemap` — `exportSitemapEntries`.
- `skill://caido-automate` — `exportAutomateEntries`.
- `skill://caido-findings` — `exportFindings`.
- `skill://caido-rewrite` — `exportTamper`.
- `skill://caido-plugins` — `exportPluginPackageData`.

- Their selectors and output formats are not interchangeable with
  `startExportRequestsTask`.
- Do not pass request IDs where a resource operation expects session,
  rule, finding, plugin, or Sitemap entry IDs.
- Use `skill://caido-workspace` for project backups and restoration.
  A request-data export is not a complete project backup.
- Do not claim HAR export, generic traffic import, or round-trip project
  restoration from JSON/CSV without a supported operation.

## Download

- Prefer the returned `downloadUri`. The verified REST contract also
  exposes `/exports/data/{export_id}` for data-export downloads.
- Resolve relative URIs against the configured instance. Preserve
  required URI parameters; do not derive download URLs from `path`.
- Use a byte-preserving HTTP response for artifact retrieval.
  `client.rest.get()` parses JSON responses and returns `undefined`
  for other successful content types; it does not provide a general
  binary or streaming download result.
- Reuse the shared SDK authentication state. Its public `auth.cache`
  option accepts a `TokenCache`, allowing the connection layer to keep
  the current instance access token available through `load` and `save`.
- A PAT approves the SDK authentication flow; it is not interchangeable
  with the resulting instance access token.
- Do not reach into private client fields or create a separate browser
  login to obtain download credentials.
- Attach instance credentials only to the intended instance origin.
  Do not forward them to an unrelated download host or redirect target.
- Check HTTP status and the returned artifact, not just the presence
  of a response body. Do not save an error or login page as a successful
  export.
- Stream large artifacts to the requested destination when possible.
  Preserve downloaded bytes rather than parsing and reserializing
  them merely to save the file.
- A server-provided filename or storage path does not determine an
  unrelated local write destination.
- These byte-transfer rules also apply to artifact URIs obtained by
  other Caido skills; their IDs and lifecycle remain owned by those
  features.

## Artifact verification

- Check the requested format and selection against the downloaded
  artifact. Report observed counts when they were actually parsed.
- Raw request and response fields in the documented request exports
  are Base64-encoded. Decode them as bytes when analysis requires it;
  do not mistake encoded text for the original HTTP bytes.
- Preserve the original export when producing decoded or transformed
  derivatives.
- Use a real CSV parser for quoted fields and delimiters. Do not split
  arbitrary CSV records on commas.
- A request without a captured response is not automatically corrupt
  export data.
- `includeRaw: true` is a requested setting, not proof that every record
  contains both request and response bytes. Inspect the actual fields.
- Distinguish a verified download from full record-by-record validation.

## Maintenance and events

- Rename using the export ID, then read back the resulting record.
  Do not assume changing a server-side name renames a downloaded copy.
- `deleteDataExport` reports `userError`, not `error`; inspect it and
  the returned `deletedId`.
- An in-progress task can prevent deletion. Report that state or cancel
  the identified task when cancellation is part of the request.
- Verify deletion against `dataExport` or `dataExports`. Deleting a
  server artifact does not remove previously downloaded copies.
- For monitoring, use `createdDataExport`, `updatedDataExport`, and
  `deletedDataExport`. Creation/update events carry `dataExportEdge`;
  deletion carries `deletedDataExportId`.
- Correlate events by export ID and refresh after a monitoring gap.
- Report export/task IDs, selectors, format and raw-data choice,
  terminal state, destination, artifact checks, and remaining errors.

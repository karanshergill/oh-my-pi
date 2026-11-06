---
name: caido-sitemap
description: Inspect and maintain Caido's Sitemap through GraphQL. Enumerate observed hosts and paths, inspect associated requests, monitor changes, index existing requests, export selections, and delete nodes.
---

# Caido Sitemap

MUST read `skill://caido-access` unless its guidance is already available in context.

## Operations

Use GraphQL. There is no verified high-level `client.sitemap` namespace.

| Operation | GraphQL field | Arguments |
|---|---|---|
| List roots | `sitemapRootEntries` | Optional `scopeId` |
| Read children or a subtree | `sitemapDescendantEntries` | `parentId`, `depth` |
| Read one entry | `sitemapEntry` | `id` |
| Index an existing request | `createSitemapEntries` | `requestId` |
| Delete selected entries | `deleteSitemapEntries` | `ids` |
| Clear the Sitemap | `clearSitemapEntries` | None |
| Export selected entries | `exportSitemapEntries` | `input` |

- Sitemap entry IDs and captured request IDs are different identifiers.
- `depth` is `DIRECT` for immediate children or `ALL` for descendants.
- Root and descendant queries return connections, but their verified
  arguments do not include `first`, `after`, `filter`, or a search string.
  Do not infer supported arguments from the connection return type.
- Search returned metadata locally when appropriate. Use
  `skill://caido-requests` for HTTPQL request searches, then correlate
  their request IDs with Sitemap entries.

## Inventory and interpretation

- Read `id`, `parentId`, `kind`, `label`, `hasDescendants`, and available
  domain metadata.
- Preserve entry kinds: `DOMAIN`, `DIRECTORY`, `REQUEST`,
  `REQUEST_QUERY`, and `REQUEST_BODY`.
- Use `DIRECT` to traverse incrementally or `ALL` to retrieve the
  requested descendants. Preserve parent relationships rather than
  treating every returned descendant as an immediate child.
- Use domain metadata such as `isTls` and `port`, together with the
  associated requests, to establish the actual endpoint.
- Do not construct authoritative URLs or filesystem paths merely by
  joining labels.
- The Sitemap reflects observed or indexed traffic. It is not an active
  crawler, a complete attack-surface inventory, or proof of the target's
  physical filesystem.
- A node does not prove a successful response, current reachability,
  authenticated access, or a vulnerability. Inspect its evidence.
- An absent node does not prove that an endpoint does not exist.

## Scope and associated requests

- Use `skill://caido-scope` when resolving a scope preset for the
  inventory.
- Pass its ID explicitly to `sitemapRootEntries` when a scoped root
  listing is requested.
- Descendant queries and an entry's request connection do not accept
  that scope argument. Do not assume a scoped root listing also
  constrains later lookups, exports, or deletion.
- Read `sitemapEntry(id).requests` for associated requests. It supports
  `first`, `after`, `last`, `before`, and `order`.
- Follow the request connection's pagination when the task requires
  its complete selection. Do not report a single page as all traffic.
- The optional singular `request` field is not a replacement for
  enumerating the request connection.
- Preserve request IDs and relevant method, host, port, TLS, path,
  query, and response information when reporting evidence.
- Use `skill://caido-requests` to retrieve raw request/response data
  or prepare follow-up requests. Reading the Sitemap does not send
  target traffic.

## Indexing existing traffic

- `createSitemapEntries(requestId)` operates on a captured request ID.
  It is not a URL submission, request-sending, or crawling operation.
- Resolve the requested captured traffic first; do not fabricate IDs
  or resend traffic merely to obtain Sitemap nodes.
- The mutation returns an operation error field, not a list of created
  entry IDs. Requery the relevant tree or observe its events to verify
  the resulting entries and associations.
- A successful indexing call alone does not establish how many new
  nodes were created or whether the request was already represented.
- Rebuilding a requested inventory from existing traffic requires
  selecting those requests and indexing them through the supported
  operation; do not invent a bulk rebuild method.

## Live updates

Use GraphQL subscriptions when monitoring is requested:

- `createdSitemapEntry(scopeId: ...)`
- `updatedSitemapEntry(scopeId: ...)`
- `deletedSitemapEntry`

- The creation and update subscriptions accept an optional scope ID;
  the deletion subscription has no scope argument.
- Creation and update events include entry information, ancestor IDs,
  request associations, and a snapshot marker. Update events can also
  identify an old request association.
- Deletion events contain `deletedIds` and a snapshot marker.
- Reconcile by entry and request IDs, not labels alone.
- Establish a baseline and account for changes during inventory
  collection. After a subscription gap, refresh the relevant state
  rather than assuming missed events will be replayed.
- Report the observed interval and selection; do not claim continuous
  coverage beyond what was monitored.

## Export

- Call `exportSitemapEntries` with:
  - `filter: { ids }`
  - `settings: { format, includeRaw }`
- Supported formats are `JSON` and `CSV`.
- Resolve the intended node selection, including descendant coverage
  when relevant. Do not assume a GUI selection or previous scope filter
  is inherited by the export.
- The successful payload contains an on-demand export with `id` and
  `downloadUri`; it is not a generic task handle.
- Use `skill://caido-exports` for retrieval and artifact verification.
  Verify the exported coverage before calling the selection complete.

## Deletion and verification

- `deleteSitemapEntries(ids)` can return both `deletedIds` and an
  `errors` array. Report partial success rather than treating the whole
  batch as successful.
- Deleting a parent permanently removes its child nodes. Establish
  the selected subtree before applying the requested deletion.
- `clearSitemapEntries` has no selection or scope argument. Use it only
  for a requested whole-Sitemap clear, not a filtered deletion.
- Do not substitute request-history deletion for Sitemap maintenance.
  A Sitemap deletion acknowledgement is not proof that captured HTTP
  evidence was erased.
- Clearing the Sitemap does not disable capture, alter scope, or block
  traffic. Continuing capture can produce new entries.
- Verify mutations by reading the affected nodes or roots and checking
  returned IDs and errors. Distinguish newly observed entries from
  entries that failed to delete.
- Report the selection, entry/request IDs, observed coverage, changes
  applied, and remaining errors or uncertainty.

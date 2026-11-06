---
name: caido-plugins
description: Discover, install, update, enable, disable, and uninstall Caido plugins. Invoke documented backend APIs, consume plugin events, manage package data, and configure plugin-backed upstream routing.
---

# Caido plugins

MUST read `skill://caido-access` unless its guidance is already available in context.

## Discovery and identity

- Use `client.plugin.pluginPackage(manifestId)` to obtain an installed
  package handle or `undefined`.
- The handle exposes `id`, `manifestId`, and `plugins`. Use GraphQL
  metadata for its version, origin, name, and other package details.
- Verified GraphQL queries include `pluginPackages`,
  `pluginPackage(id)`, `pluginPackageByManifest(manifestId)`, and
  `store.pluginPackages`.
- Store records provide manifest IDs, versions, repository/readme links,
  authorship, and available quality or official-status metadata.
  A store listing is not proof of installation.
- Keep package manifest IDs, installed package IDs, component manifest
  IDs, and component runtime IDs distinct.
- Component kinds include `PluginBackend`, `PluginFrontend`, and
  `PluginWorkflow`. They have independent enabled states.
- A backend additionally exposes `state.running` and optional
  `state.error`. Enabled does not necessarily mean running successfully.
- Use a plugin's actual documentation, source, or `PluginPackageSpec`
  to establish supported operations and argument/result contracts.

## Installation and updates

`client.plugin.install` accepts one source:

- `{ manifestId }`
- `{ file }`, where `file` is the package ZIP as a `File`
- `{ url }`

It also accepts `{ source, force }` or the corresponding flat form
with optional `force`.

- Select the intended package source and version. Installing or enabling
  a package can execute third-party code; it is not a metadata-only read.
- Do not substitute a local path string for an uploaded file.
- Treat `force` as a deliberate replacement choice, not a generic
  workaround for signature, package, authentication, or compatibility
  errors.
- Do not invent a high-level `update` method. Establish the supported
  installation/replacement path for the requested version.
- Where supported, GraphQL `installPluginPackages` accepts
  `input: { sources, force }` and returns both `packages` and `errors`.
  Handle partial success rather than assuming the batch was atomic.
- Verify the actual installed version, component states, and relevant
  retained configuration after installation or replacement.
- Startup configuration also supports `config.plugins` entries using
  `store` or `path`. A startup `path` belongs to the Caido host; it is
  different from an SDK upload's local source file.
- Do not change unrelated startup configuration to install a package.

## Enable, disable, and uninstall

- Use GraphQL `togglePlugin(id, enabled)` with the component runtime ID,
  not the package ID.
- Change only the intended components. Headless access does not require
  disabling an existing frontend component.
- Inspect the returned plugin and operation error, then verify the
  backend runtime state when relevant.
- Use `uninstallPluginPackage(id)` for one installed package.
- Where supported, `uninstallPluginPackages(ids)` returns `deletedIds`
  and `errors`; report partial failures.
- Do not assume disabling or uninstalling a component cancels every
  plugin-owned job, restores modified requests, or preserves all data.
  Establish the plugin's actual lifecycle contract.
- Reacquire package handles after installation, replacement, or state
  changes. Existing handles retain their earlier component metadata.

## Backend calls and events

Use the package handle:

- `pkg.callFunction({ name, arguments, manifestId })`
- `pkg.subscribeEvent(name)`
- `pkg.subscribeEvent({ name, manifestId })`

- `arguments` is the positional JSON argument array expected by the
  documented backend function.
- Here, `manifestId` identifies a backend component. When a package has
  multiple backends, specify the intended component; the SDK otherwise
  selects the first matching backend.
- The SDK's dynamic method proxy is not capability discovery.
  `typeof pkg.someName === "function"` does not prove that the backend
  exports `someName`.
- Typed method shortcuts are useful with a known `PluginPackageSpec`;
  do not invent scanner, authorization-testing, or conversion methods
  from a plugin's display name.
- Backend calls execute in Caido's plugin runtime, not in the agent's
  local process. Do not import a plugin entrypoint into OMP as a substitute.
- The SDK uses REST `/plugin/backend/{component_id}/function`.
  Its wire body is `{ name, args }`, where each `args` element is a
  JSON-encoded string. The high-level SDK handles this encoding.
- Do not double-encode high-level arguments or invent a GraphQL
  function-call mutation.
- Successful REST calls contain an optional JSON-encoded `returns`;
  the SDK decodes it. A valid void return is not proof that a plugin's
  background job has completed.
- Event iterables yield argument tuples. Use the documented event
  contract, correlate the relevant operation, and end subscriptions
  when monitoring is complete.
- Plugin-owned job IDs and events are not automatically Caido generic
  task IDs or `finishedTask` events.
- A frontend-only feature is not automatically callable headlessly.
  Use its documented backend or native API counterpart where one exists;
  do not use GUI interaction to fill a missing backend interface.

## Package data

Use the installed package ID and key:

- Read: `pluginPackageData(id, key)`.
- Define key flags: `definePluginPackageData(id, input: { key, flags })`.
- Set value: `setPluginPackageData(id, key, data)`.
- Delete key data: `deletePluginPackageData(id, key)`.

- Read the plugin's data contract before changing its stored values.
- A data record contains its `key`, owning `package`, `flags`, and
  optional JSON `value`.
- Defining flags and setting a value are separate operations.
  Supported flags include `exportable`.
- Preserve unrelated keys, fields, and flags. Do not assume setting a
  JSON value performs a recursive merge.
- Distinguish a missing record from an existing record whose value is
  absent or null.
- Inspect mutation errors and success flags, then read back the key.
- Frontend component `data` and `setPluginData(id, data)` are a separate
  interface using a component ID. Do not confuse them with package-level
  keyed data or migrate between them without the plugin's contract.

## Data export and import

- `exportPluginPackageData` takes `input: { filter: { ids } }` for
  the selected packages and returns an on-demand export.
- Preserve exportability flags and inspect actual export coverage;
  do not claim every stored key was included merely because the export
  succeeded.
- Use `skill://caido-exports` to retrieve and verify the artifact.
- Import through `importData({ pluginPackageData: { file } })`, using
  an `Upload` value for the actual data artifact.
- Inspect `errors` and the `PluginPackageDataSummary`, including
  `packagesImported`, and verify the intended records.
- Package-data import is not plugin-code installation. Do not pass a
  plugin ZIP to the data importer or assume importing data installs
  a compatible plugin version.

## Plugin-backed upstream routing

Where supported, use GraphQL:

- Query: `upstreamPlugins`.
- Mutations: `createUpstreamPlugin`, `updateUpstreamPlugin`,
  `deleteUpstreamPlugin`, `toggleUpstreamPlugin`, `rankUpstreamPlugin`.

- Creation/update inputs contain `pluginId`, `allowlist`, `denylist`,
  and `enabled`; updates also identify the upstream record by `id`.
- `pluginId` identifies the backend component, not its package.
- Bind only a backend implementing the required upstream contract.
  Ordinary backend-function support alone does not establish that.
- Toggle with the upstream record ID and `enabled`; rank with its ID
  and `input` containing the intended `beforeId` or `afterId`.
- Preserve unrelated matching rules and ordering. Do not infer its
  precedence relative to HTTP/SOCKS proxies without the target
  version's routing contract.
- Use `skill://caido-proxy` for the surrounding network configuration
  and verify actual forwarding when that is part of the task.

## Verification and reporting

- Distinguish installed, enabled, running, callable, and successfully
  completed states.
- Verify plugin-specific effects through its documented results,
  events, captured traffic, findings, or persisted state.
- A plugin's positive finding is evidence to investigate, not an
  automatically confirmed vulnerability.
- Report package/version and component IDs, state changes, invoked
  function and relevant operation IDs, data changes, observed results,
  and remaining errors or unsupported interfaces.

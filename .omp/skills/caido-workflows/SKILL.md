---
name: caido-workflows
description: Manage and execute Caido passive, active, and convert workflows. Inspect and edit definitions, control availability and activation, test behavior, run workflows, and transfer definitions headlessly.
---

# Caido Workflows

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Own workflow definitions, lifecycle, testing, and execution.
- Native encoding, decoding, hashing, and conversion belong here.
- Workflow execution happens on the Caido instance.
- Rules, Automate sessions, and Replay sessions own their workflow bindings.
- Changing a binding is not a request to edit the referenced workflow.

## SDK operations

| Operation | SDK |
|---|---|
| List workflows | `client.workflow.list()` |
| Read a workflow | `client.workflow.get(id)` |
| Create | `client.workflow.create({ definition, global })` |
| Update definition | `client.workflow.update(id, { definition })` |
| Enable or disable | `client.workflow.toggle(id, enabled)` |
| Delete | `client.workflow.delete(id)` |
| Test an unsaved definition | `client.workflow.test(options)` |
| Execute active or convert workflow | `client.workflow.run(options)` |

Use GraphQL for operations without a high-level wrapper:

- `renameWorkflow(id, name)`
- `globalizeWorkflow(id)`
- `localizeWorkflow(id)`
- `workflowNodeDefinitions { raw }`

## Identify and inspect

- Resolve the workflow by ID or an unambiguous name.
- Inspect its definition, kind, enabled state, global visibility, and `readOnly`.
- Read the latest definition before editing.
- Preserve node IDs, aliases, connections, and unrelated configuration.
- Preserve script contents and graph layout when unrelated to the change.
- Use the dedicated rename operation for a display-name-only change.
- A read-only definition is not permission to silently replace its workflow.
- Create a separate copy only when copying is the intended operation.

## Define behavior

- Select the intended workflow kind and input/output contract.
- Read supported node definitions instead of inventing node types or ports.
- Preserve connections and references when changing a node.
- Node aliases are unique within a workflow and use lowercase letters,
  digits, hyphens, or underscores.
- Use the injected Workflow SDK inside JavaScript nodes.
- NEVER confuse that SDK with the external `@caido/sdk-client`.
- Verify runtime facilities before using Node.js or Bun-specific APIs.
- Shell nodes execute commands on the Caido host, not the agent's host.
- Preserve the intended shell, initialization, input encoding, and output contract.
- Inspect imported or modified logic for requests, findings, file writes,
  shell commands, and other effects before executing it.

## Availability and activation

- Specify global versus project-specific visibility explicitly on creation.
- Preserve existing visibility during unrelated definition edits.
- Global availability does not make project-specific dependencies portable.
- Creation may enable a workflow immediately; the documented default is enabled.
- Treat creation of a passive workflow as potentially affecting live traffic.
- NEVER describe create-then-disable as atomic or free of an execution window.
- Inspect the returned activation state and apply the intended state explicitly.
- Enabling a workflow and manually running it are different operations.

## Test a definition

- `client.workflow.test` executes a definition without saving it.
- “Without saving” does not mean side-effect-free.
- Convert tests use `{ kind: "convert", definition, data }`.
- Active/passive tests use the corresponding lowercase `kind`, the definition,
  and `request: { connection, raw }`, with optional `response: { raw }`.
- Preserve actual input bytes and transport connection information.
- Inspect the returned `runState` and convert output where applicable.
- Verify representative matching, nonmatching, and relevant error paths.
- A successful API call does not establish that the intended branch executed.
- A test result does not prove persistence or automatic triggering.

## Run a convert workflow

- Call `client.workflow.run({ kind: "convert", id, data })`.
- Use `Uint8Array` when binary or non-ASCII input must be preserved.
- The SDK handles GraphQL encoding; NEVER Base64-wrap its input redundantly.
- Returned `output` is an optional `Uint8Array`.
- Distinguish missing output from valid empty output.
- Decode output as text only when its encoding and intended use permit it.
- Check the actual transformation, not merely that bytes were returned.

## Run an active workflow

- Call `client.workflow.run({ kind: "active", id, requestId })`.
- Use an existing captured request ID, not a Replay session or entry ID.
- The result is a `WorkflowTask`, not transformation output.
- Retain its task ID and workflow ID.
- Establish completion observation before starting brief runs.
- Use `client.task.finished(...)` and correlate events by task ID.
- Inspect terminal status and error information.
- Use the returned task's `cancel()` when cancellation is intended.
- Cancellation does not undo effects that have already occurred.
- NEVER infer success from disappearance from the active-task list.
- NEVER rerun merely to recover an uncertain completion status.

## Operate a passive workflow

- Enable it and observe the traffic/events matching its trigger and conditions.
- There is a passive test operation, but no passive `client.workflow.run` variant.
- NEVER invent a `runPassiveWorkflow` operation.
- Verify the resulting findings, requests, outputs, or other intended effects.
- A passive workflow may create and send a modified copy of a request.
- NEVER assume that this edits the original proxied message in place.
- Use `skill://caido-rewrite` for automatic Match & Replace behavior.
- Use `skill://caido-intercept` for explicit queued-message modification.

## Transfer definitions

- Read definitions through the SDK for headless export.
- Preserve the definition structure and record its kind and dependencies.
- An SDK metadata object is not automatically a valid workflow import file.
- For headless recreation, pass the supported definition to `create` or `update`.
- NEVER invent `client.workflow.import` or `client.workflow.export` methods.
- Verify the target version's file format before claiming UI-file compatibility.
- Resolve referenced workflows, scopes, plugins, and other dependencies.
- NEVER silently overwrite a same-named workflow or assume IDs remain portable.
- Inspect visibility and activation after creation or import.

## Delete

- Resolve the exact workflow ID.
- Identify known rule, Automate, Replay, and workflow references before deletion.
- Deleting a workflow does not repair its callers.
- NEVER delete or reconfigure those callers as an implicit side effect.
- Confirm the workflow is absent and report affected known references.

## Verify and return

- Definition changes → retrieve and compare the intended graph changes.
- Visibility/activation → verify `global` and `enabled`.
- Execution → report workflow/task IDs, observed status, output, and effects.
- Passive behavior → report the triggering evidence and resulting effects.
- Transfer → report created IDs and dependency or compatibility gaps.
- Distinguish saved, enabled, tested, executed, and behaviorally verified states.
- NEVER equate saving or enabling a workflow with successful execution.

## References

- Workflow kinds: https://docs.caido.io/app/concepts/workflows_intro
- Creating workflows: https://docs.caido.io/app/guides/workflows_creating
- JavaScript nodes: https://docs.caido.io/app/guides/workflows_javascript
- Shell nodes: https://docs.caido.io/app/guides/workflows_shell
- Workflow SDK: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/workflow.ts
- Workflow types: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/types/workflow.ts
- Task lifecycle: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/task.ts

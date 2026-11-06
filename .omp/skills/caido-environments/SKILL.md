---
name: caido-environments
description: Read, create, select, rename, and delete Caido environments. Manage global and custom variables, account-specific tokens, and reusable values for headless testing.
---

# Caido environments

MUST read `skill://caido-access` unless its guidance is already available in context.

## Operations

Use the singular namespace `client.environment`.

| Operation | SDK |
|---|---|
| List environments | `client.environment.list()` |
| Read an environment | `client.environment.get(id)` |
| Create | `client.environment.create({ name, variables })` |
| Update or rename | `client.environment.update(id, { name, variables, version })` |
| Delete | `client.environment.delete(id)` |
| Select | `client.environment.select(id)` |
| Deselect | `client.environment.select(undefined)` |

- `list()` returns an array of environment snapshots, not a paginated
  builder or an array of mutable environment handles.
- `get(id)` returns an `EnvironmentInstance` or `undefined`.
- Creation and selection also return an `EnvironmentInstance` when
  an environment is present.
- Deselecting can return `undefined`; this is not a missing-environment
  failure.
- Read the GraphQL `environmentContext` query to identify `global` and
  `selected`. The high-level SDK has no verified context-reading method.
- Resolve the global environment from that context, not from a name
  such as `Global`. Do not infer selection from list order.

## Selection and precedence

- Global variables are available across projects. Changes to global
  values can therefore affect more than the current project.
- Custom variables are available when their environment is selected.
- A selected custom variable overrides a global variable with the same
  name.
- Removing a custom override can expose the global value again rather
  than making the variable unavailable.
- Deselecting a custom environment leaves global variables available.
- Creating, editing, and selecting are distinct operations. Read back
  the context rather than assuming an operation changed selection.
- Change selection when the requested operation calls for it. Do not
  select an environment merely to inspect or edit its stored variables.
- Do not assume selection is isolated to one Replay session or that an
  already-running operation captured a particular environment version.

## Variables

Each variable has:

- `name`: the exact variable name.
- `value`: its string value.
- `kind`: `PLAIN` or `SECRET`.

An `EnvironmentInstance` exposes:

- `addVariable({ name, value, kind })`
- `updateVariable(name, updates)`
- `deleteVariable(name)`

- Obtain the handle with `get(id)` or from a successful creation or
  selection operation.
- Resolve existing variables by their exact names before choosing
  addition, update, rename, or deletion.
- `updateVariable` does not create a missing variable. Updating or
  deleting an absent name can submit an unchanged variable list;
  a resolved SDK call alone does not prove the requested change occurred.
- `addVariable` is not an upsert. Do not append a duplicate name while
  intending to replace its value.
- Preserve the existing kind when changing only a value or name.
- A same-name variable in another environment can be an intentional
  override, not a duplicate that should be removed.
- Rename a variable through `updateVariable(oldName, { name: newName })`
  or a complete environment update. Check for a conflicting destination
  name within that environment.
- Renaming a variable does not establish that request placeholders,
  workflow code, or other consumers were rewritten. Report known
  affected references and update them when that is part of the task.

## Version-safe updates

- Read the latest environment before modifying it. Its `version` is
  required by `client.environment.update`.
- Environment updates replace the supplied name and variable list.
  Preserve unrelated variables, their values and kinds, and the
  environment name unless the task changes them.
- Rename an environment by updating its name while preserving its
  variables and supplying the current version; do not invent a
  separate SDK rename method.
- Instance variable helpers use their handle's cached state and version.
  Reacquire a handle after external changes rather than applying a
  stale snapshot.
- On a version conflict, reload and reconcile the requested changes
  against the current state. Do not overwrite intervening edits or
  blindly resubmit the old full variable list.

## Secret values

- Use `SECRET` when secret handling is requested; preserve it on
  subsequent updates.
- Caido documents secret variables as obfuscated in the frontend and
  on disk. Do not treat this as a guarantee that API results or logs
  redact their values.
- Routine summaries should identify secret variables by name, kind,
  and change status rather than reproduce their values.
- Verify a requested secret update without printing the secret.
  Do not downgrade it to `PLAIN` merely to inspect or use it.

## Consuming variables

- These are Caido environment variables, not shell variables or OMP
  configuration.
- In Replay, environment values are substituted through configured
  placeholders and an Environment Variable preprocessor.
- Do not assume arbitrary `{{name}}` text in raw HTTP is expanded.
- Preprocessors run in their configured order; preserve that order
  when binding variables with other transformations.
- Use `skill://caido-requests` or `skill://caido-replay` for request
  preparation and transmission. This skill owns values and selection,
  not an independent sending mechanism.
- Before account-comparison requests, establish the selected environment
  and effective values, including any global fallback or custom override.
- Saving a token or selecting an environment does not prove that a
  request used it or that the target accepted it. Check the actual sent
  request and response when transmission is part of the task.

## Deletion and verification

- Resolve the environment ID before deleting it. Removing an environment
  and removing one variable are different operations.
- Read back `environmentContext` after deletion or selection changes;
  do not assume which environment or fallback is now effective.
- Verify variable edits against the resulting stored environment.
  Distinguish stored values from effective values masked by an override.
- Report the environment name and ID, resulting selection, variables
  changed, relevant fallback or precedence effects, and verification
  performed.
- Keep persistence, selection, request substitution, and successful
  authentication separate in the result. Claim only what was checked.

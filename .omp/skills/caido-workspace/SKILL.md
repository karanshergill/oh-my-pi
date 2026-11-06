---
name: caido-workspace
description: Manage Caido projects, backups, restoration tasks, startup project selection, and data-directory migrations through headless interfaces.
---

# Caido workspace

MUST read `skill://caido-access` unless its guidance is already available in context.

## Projects

Use the singular namespace `client.project`.

| Operation | SDK |
|---|---|
| List projects | `client.project.list()` |
| Create | `client.project.create({ name, temporary })` |
| Rename | `client.project.rename(id, name)` |
| Select | `client.project.select(id)` |
| Delete | `client.project.delete(id)` |

- `list()` returns an array. There is no verified high-level project
  `get` method; resolve a record from that list.
- Project metadata includes `id`, `name`, `path`, `status`, `temporary`,
  `createdAt`, `updatedAt`, `version`, `size`, and `readOnly`.
- Read the active project with the shared-client script:
  ```sh
  /home/me/.local/share/omp-runtimes/bun/bin/bun /home/me/oh-my-pi/.omp/tools/caido/current-project.ts
  ```
- Its JSON output is the selected project's `id`, `name`, and `readOnly`,
  or `null` when none is selected. List order does not identify selection.
- Treat selection as a real context change for project-scoped operations,
  not a local SDK preference. Do not assume existing tasks move to
  the new project.
- Rerun the shared-client script after selection and after operations that
  might affect the active project.
- Creation, restoration, and selection are distinct operations.
  Do not assume creating a project establishes the intended selection.

## Persistence and readiness

- Supply the intended `temporary` value when creating a project.
- Use GraphQL `persistProject(id)` to persist a temporary project.
  Inspect its `error` and returned `project`, then verify `temporary`.
- Do not guess a temporary project's retention lifetime or make it
  persistent merely to inspect it.
- Project statuses are `READY`, `RESTORING`, and `ERROR`.
- `readOnly` can reflect access or account restrictions; it is not
  automatically evidence of a corrupt project.
- Report observed readiness, version, and access errors. Do not change
  version metadata or edit database files to force selection.
- Do not delete other projects as an implicit workaround for a
  read-only or account-limit error.

## Backup operations

Use GraphQL:

| Operation | Field | Arguments |
|---|---|---|
| List backups | `backups` | None |
| Read a backup | `backup` | `id` |
| Start backup | `createBackup` | `projectId` |
| List backup tasks | `backupTasks` | None |
| Cancel backup task | `cancelBackupTask` | Task `id` |
| Rename backup | `renameBackup` | Backup `id`, `name` |
| Delete backup | `deleteBackup` | Backup `id` |
| Restore backup | `restoreBackup` | `input` |
| List restore tasks | `restoreBackupTasks` | None |
| Cancel restore task | `cancelRestoreBackupTask` | Task `id` |

- Backup, project, backup-task, and restore-task IDs are distinct.
- The backup and task listings are arrays, not paginated connections.
- A backup includes `id`, `name`, `path`, `size`, timestamps, `status`,
  optional `downloadUri`, and an optional source `project`.
- Do not treat a missing source-project association as proof that a
  self-contained backup is unusable.
- Backup statuses are `PROCESSING`, `DONE`, and `ERROR`.
  There is no verified `CANCELLED` backup-record status.
- Caido documents backup creation as a paid feature and restoration
  as available on all plans. Report actual server restrictions.
- Backups contain project data. Verify instance-wide dependencies
  separately before claiming a complete instance migration.

## Create and download a backup

- Resolve the source project ID without selecting another project
  merely to create its backup.
- Inspect `createBackup.error` before using its optional `task`.
- Retain `task.id` and `task.backup.id`.
- Track completion through the dedicated backup events and resulting
  backup record.
- A started task or `PROCESSING` record is not a completed backup.
- Download the completed artifact through its returned `downloadUri`
  or the supported `/backup/{backup_id}` REST route.
- Use `skill://caido-exports` for authenticated, byte-preserving artifact
  transfer. Do not pass a backup ID to a data-export endpoint.
- Preserve the `.caidobak` file as an opaque backup artifact. Do not
  unpack or rewrite it merely to change the restored project's name.
- Creation, download, and a successful test restoration are separate
  verification levels. Report only those performed.

## Restore

`restoreBackup` accepts `input: { name, source }`.

Choose exactly one source branch:

- `{ backupId }` for an existing backup.
- `{ file }` for a backup uploaded as an `Upload` value.

- Use the intended project name and actual `.caidobak` contents.
  Do not substitute a local path string or Base64 text for an upload.
- Do not submit both source branches.
- Inspect `restoreBackup.error` before using the returned task.
- Retain the restore-task ID and `task.project.id`; `task.backup` can
  be absent for an uploaded source.
- Follow the resulting project's status and the restore completion
  event. A visible `RESTORING` project is not proof of success.
- Verify the resulting project name, ID, readiness, and intended
  selection. Verify restored data when that is part of the task.
- Do not assume restoration overwrites an existing project or preserves
  the original project ID; use the actual returned record.
- Handle name conflicts and incompatible or invalid backups without
  deleting an existing project or editing backup internals as a shortcut.

## Dedicated task completion

- Use `startedBackupTask` and `finishedBackupTask` for backup creation.
- Use `startedRestoreBackupTask` and `finishedRestoreBackupTask` for
  restoration.
- Establish the relevant listeners early when awaiting an operation.
- The finished payloads are unions. Request `__typename` and handle
  their success, error, and cancelled variants:
  - Success carries `task`, including its ID.
  - Error carries `taskId` and `error`.
  - Cancellation carries `taskId`.
- Do not query a generic `status` field on these union payloads or
  assume they use `finishedTask`.
- Cancel with the dedicated mutation for the task kind; inspect its
  `error` and `cancelledId`.
- After cancellation or failure, inspect any remaining backup or project
  state. Do not claim that partial artifacts were removed automatically.
- A task missing from a live task list is not proof of success.

## Startup project selection

- Read `globalConfig.project`.
- Update it with `setGlobalConfigProject(input)` when startup behavior
  is part of the request.
- Supported `selectOnStart` values are:
  - `LAST_USED`
  - `NOTHING`
  - `SELECTED`, with the intended `selectProjectId`
- Preserve unrelated configuration and the intended project reference.
- Verify the returned `config.project`.
- Startup configuration and immediate `selectProject` are separate
  controls. Do not restart Caido merely to change this setting.

## Data-directory migration

- A project's returned `path` is storage metadata, not an editable
  project location or necessarily a path on the agent's machine.
- Caido's CLI supports `--data-path <location>` for the instance data
  directory. This is a startup setting, not a project rename.
- Pointing Caido at an empty directory does not migrate existing data.
- For a requested full data-directory move, establish the actual host,
  service control, source, and destination. Preserve a coherent data
  copy before restarting with the new location.
- Stop the affected instance deliberately before an offline filesystem
  copy; do not copy or rewrite live SQLite files as routine maintenance.
- Use project backups when transferring project data through the API.
  Do not imply that they also migrate every instance-wide setting.
- Do not launch an unrelated local instance as a substitute for
  controlling the configured instance.

## Deletion and reporting

- Project deletion is destructive. Resolve the intended project ID and
  any requested recovery requirement before applying it.
- Do not claim a deleted project is recoverable without a verified
  backup or other established recovery source.
- Project deletion, backup deletion, and deletion of downloaded copies
  are separate operations. Inspect what remains.
- `deleteBackup` can report an in-progress-task error; cancellation
  requires the appropriate task operation.
- Verify renames and deletions through the corresponding listings
  and current-project state.
- Project and backup events include `createdProject`, `updatedProject`,
  `deletedProject`, `selectedProject`, `createdBackup`, `updatedBackup`,
  and `deletedBackup`; correlate by IDs.
- Prefer supported APIs over historical manual-SQL cleanup recipes.
  Do not modify a running project's databases as a fallback.
- Report source and resulting project IDs, selection, persistence and
  readiness, backup/task IDs, artifact destinations, observed completion
  or failure, and verification performed.

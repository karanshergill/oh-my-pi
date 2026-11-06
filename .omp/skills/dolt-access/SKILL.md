---
name: dolt-access
description: Use when reading, updating, checkpointing, or diagnosing hunt records stored in Dolt. Provides shared connection, transaction, and recovery rules.
---

# Dolt access

MUST read `skill://dolt-access/references/hunt-records.md` unless already in context.

## Responsibility

- Provide shared headless access to the engagement record store. Follow the shared contract for ownership, record relationships, history, evidence, and Caido synchronization.
- Storage success does not establish that an experiment succeeded, a vulnerability was validated, or a report was synchronized. Those decisions require their own evidence.
- Loading this skill does not install dependencies, start services, create a schema, or perform record operations.

## Prerequisites

- Use this checkout's `hunt` tool for ordinary record operations. Confirm the engagement ID, server availability, schema, and writer status before modifying records.
- Missing runtime, connection, authentication, schema, or writer capability → identify the exact prerequisite. NEVER invent tables from this prose contract or silently substitute another storage backend.
- Check actual server/client versions and tool definitions before relying on a capability. A tool name alone does not establish its argument schema or transaction behavior.
- Use SQL/CLI/MCP reads for explicit diagnostics, not as a fallback mutation path around the coordinated writer.
- This writer requires Linux, Bun 1.4.4, and Dolt 2.6.2. Runtime upgrades require a compatibility check before engagement writes.

## Project-local runtime

- Start `source .omp/runtime/env.sh && bun .omp/scripts/hunt-server.ts` from this checkout as a named, long-lived service. Reuse an already reachable configured server rather than starting a second instance.
- The launcher uses `.omp/runtime/dolt/bin/dolt` and `.omp/hunts/server/config.yaml`. It supplies the YAML path variables from its own checkout location; do not substitute paths from the installed OMP.
- Read `listener.host` and `listener.port` from the server configuration. Connect as SQL user `root`; load `.omp/hunts/server/password` programmatically without returning its value.
- The launcher keeps `HOME`, `DOLT_ROOT_PATH`, and `TMPDIR` inside `.omp/hunts/server/`. Its Dolt global configuration is `home/.dolt/config_global.json` within that directory, not the user’s global configuration.
- `DOLT_ROOT_PASSWORD` bootstraps a new privilege store only. Once `privileges.db` exists, changing the password file does not rotate the SQL password. Reconcile mismatches through explicit credential maintenance; NEVER delete or replace privilege state as an implicit authentication fix.
- Settle active writes before shutdown, send `SIGTERM` or `SIGINT`, and await the launcher’s exit. Reconcile interrupted write/checkpoint outcomes before resuming.

## Hunt tool operations

- `status` and `inspect` are read-only. Distinguish absent, incomplete, conflicting, unsettled, and ready engagement state.
- `initialize` requires stable engagement and operation UUIDs plus the engagement name. It installs the approved schema in a new database; it does not create or switch a Caido project.
- Interrupted metadata initialization after complete schema installation accepts only the original operation UUID and identical input against an empty record store with unchanged physical schema. Partial DDL, changed schema, or an unknown installation intent requires maintenance.
- `save` persists one coherent semantic batch with revision guards and returns its immutable receipt and checkpoint outcome. Retain generated record IDs.
- `checkpoint` records an explicit checkpoint reason, including handoff. All successful `save` batches also request a checkpoint.
- Retain the same operation UUID for identical mutation input. Reusing it with different input is rejected; replay returns the recorded outcome rather than repeating the batch.
- After an uncertain outcome, use `operation` to inspect the same ID. Use `resume` only when persistence reconciliation is requested; it may finish the checkpoint or establish that the requested batch was not saved.
- `sqlState` describes the requested batch, not preparation metadata. Only `checkpoint.state=confirmed` confirms the returned native hash.
- Unowned working changes, unexpected native history, or schema conflicts require inspection. NEVER discard data or force a checkpoint to bypass them.
- OMP supplies the actual recorder session, tool-call, and leaf IDs. Scientific contributors and executors remain explicit record data.

## Connection and context

- Select the engagement database and branch explicitly. NEVER rely on the current directory, an alphabetically selected database, a default branch, or another call’s session state.
- Resolve the engagement by stable ID and verify its database/branch mapping. Keep local record IDs distinct from Caido instance, project, and object IDs.
- Reuse configured credentials without printing them, putting them in command arguments, or copying them into records. Keep diagnostic output free of credentials and raw captures.
- Keep engagement runtime data and configuration under `.omp/hunts/` in this checkout. Ensure an explicit repository ignore rule exists before creating that data; do not place it in the installed OMP or global agent configuration.
- When setup is explicitly requested, account for `DOLT_ROOT_PATH`, SQL-server `data_dir`, `cfg_dir`, privilege files, and branch-control files. Defaults can otherwise place state outside the intended project-local directory.
- Read SQL autocommit and automatic Dolt-checkpoint configuration before writing. Do not silently change shared settings or assume SQL persistence and history preservation have identical boundaries.

## Reading records

- Use the installed schema and stable record IDs. Select the fields needed for the task rather than dumping the engagement database.
- Distinguish current working data from staged changes and committed history. Use the appropriate version-control views, such as `dolt_status` and `dolt_log`, when investigating state or checkpoints.
- Use a pinned checkpoint for historical reconstruction; do not present current working data as the evidence available at an earlier report revision.
- Preserve the distinction between no matching records, unavailable evidence, a query failure, and an inaccessible database.

## Writing records

- Route ordinary engagement mutations through `hunt`, which holds the engagement writer lease and executes each coherent update in one SQL transaction. Separate CLI invocations or MCP calls do not preserve that transaction.
- Bind record values through the SQL client. NEVER interpolate captured traffic, payloads, titles, or report text into SQL. Resolve identifiers from the verified schema and connection context.
- Apply revision checks within the transaction and verify affected-row counts. Surface stale revisions as conflicts instead of silently overwriting newer records.
- Preserve foreign-key relationships, immutable records, and recorder/run provenance required by the shared contract. A partial multi-record update is not a successful save.
- On an ordinary transaction error, roll back the uncommitted operation and report the failure. If the connection is lost around commit, reconcile the persisted record IDs/revisions before retrying; the outcome may be uncertain.
- A storage failure MUST NOT cause automatic re-execution of the target experiment.

## Dolt checkpoints

- SQL `COMMIT`, a Dolt history commit, and a Git commit of OMP source are different operations. Report their outcomes separately.
- Create the checkpoints required by the shared contract through the coordinated writer. Inspect included changes and stage the intended tables; do not sweep unrelated pending work into a checkpoint unnoticed.
- Account for newly created tables: `DOLT_COMMIT` with `-a` stages modified tracked tables, whereas `-A` also includes new tables. Neither flag replaces inspection of the changes being committed.
- `DOLT_COMMIT` also commits the current SQL transaction. NEVER assume a later SQL rollback can undo that checkpoint or earlier committed work.
- Record the actual resulting Dolt commit hash. If SQL persistence succeeds but checkpointing fails, preserve and report that distinction; do not claim the records are checkpointed.
- Do not force past constraint violations, amend history, discard working changes, or change branches as silent checkpoint recovery.

## Recovery and backup

- Reconcile uncertain writes and checkpoints against stored IDs, revisions, and history before repeating them. Reconnect to the same explicit database and branch.
- Treat provisioning, schema migrations, restore, reset, history rewriting, and remote transfer as separate maintenance operations—not implicit fixes for ordinary access errors.
- Use supported backup procedures. Dolt backup includes database working sets; a branch push does not preserve every working set or external artifact.
- Verify the intended backup destination and overwrite behavior. Backup synchronization can replace destination branches and working sets.
- Include required configuration and preserved artifact files in the recovery plan. A database backup alone is not a complete engagement backup.
- NEVER treat copying a live database directory as proof of a consistent backup.

## Return

- MUST keep routine hunt replies to material results, persistence/checkpoint
  status, blockers or uncertainties, and the next action.
- MUST retain complete evidence, provenance, and receipt metadata in records;
  brevity changes replies, never storage or verification.
- IDs, internal paths, byte counts, digests, revisions, database/branch names,
  and checkpoint hashes: include only when requested or needed for a specific
  user action or diagnosis. NEVER dump receipt inventories by default.
- MUST surface failed, partial, or uncertain persistence and material evidence
  gaps. NEVER hide integrity failures for brevity.
- NEVER include credentials or unnecessary evidence contents.

## References

- [Dolt CLI and SQL server](https://www.dolthub.com/docs/cli-reference/cli)
- [Dolt SQL version-control procedures](https://www.dolthub.com/docs/sql-reference/version-control/dolt-sql-procedures)
- [Branches and SQL sessions](https://www.dolthub.com/docs/sql-reference/version-control/branches)
- [SQL-server configuration](https://www.dolthub.com/docs/sql-reference/server/configuration)
- [Dolt 2.6.2 authentication bootstrap](https://github.com/dolthub/dolt/blob/v2.6.2/go/cmd/dolt/commands/sqlserver/server.go#L517-L594)
- [Dolt backups](https://www.dolthub.com/docs/sql-reference/server/backups)

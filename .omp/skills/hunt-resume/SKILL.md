---
name: hunt-resume
description: Use when resuming an engagement, taking over prior investigation work, or reconstructing its stored state. Reconcile unfinished experiments, evidence gaps, stale reports, and uncertain synchronization without blindly repeating operations.
---

# Hunt Resume

MUST read `skill://dolt-access` unless already in context.

## Responsibility

- MUST reconstruct investigation state from Dolt records and preserved evidence. Conversation summaries are leads, not proof that operations were saved or completed.
- Investigation resumption is not OMP chat restoration or automatic resumption of a native Caido task.
- Status-only or historical inspection? MUST keep the operation read-only; do not continue tests or change stored records.

## Resolve the continuation context

- MUST resolve the intended engagement, database, branch, objective, and Caido/native-tool instance/project associations from the request and available records.
- Ambiguous context? MUST inspect available records before asking; NEVER silently choose another engagement or switch native tool projects.
- MUST distinguish inspecting a historical checkpoint from restoring working state. Restore, reset, and history rewriting are separate maintenance operations.
- Before new target work, MUST refresh program authorization, guidelines, scope, and prerequisite context; use `skill://caido-scope` for scope resolution. Stored references alone do not establish current rules.
- MUST distinguish confirmed changes from unverified assumptions about identities, state, versions, or environment. Preserve the conditions attached to earlier results.
- Environment or access guidance changed? MUST reread the owning skill and recheck affected capability blockers using read-only checks.
- MUST distinguish tool availability from required project, process, and access readiness.

## Reconstruct the work

- MUST inspect current working records as well as checkpoint history. SQL-persisted work can be newer than the last Dolt checkpoint; NEVER discard it as routine resumption.
- MUST inspect `hunt` status and outstanding operation IDs before continuation. `operation` is read-only and includes current attempt/file observations for exports; `resume` may save reconciliation outcomes and checkpoint acknowledgements, never repeat target actions.
- MUST recover the working target model, approach families, active hypotheses, decisive propositions, surface/research context, observations, assessments, blockers, and recorded next actions.
- MUST recover unresolved contradictions, verification outcomes, and remaining verification gaps with their supporting evidence and conditions.
- MUST identify planned, running, or uncertain experiments and completed results not yet reflected in their assessments.
- MUST inspect linked evidence availability, finding readiness, current report revisions, stale reports/exports, and unresolved sync attempts.
- SHOULD load the records needed for continuation rather than replaying the entire conversation or re-mapping the whole application.

## Reconcile experiment execution

- MUST treat persisted execution states as last recorded knowledge, not live job status.
- MUST use the owning Caido skill to inspect tracked task, run, session, entry, and capture IDs; read that skill unless already in context.
- MUST inspect historical execution entries and their captures. Current editor drafts or session settings do not establish past inputs.
- MUST distinguish native task state, experiment execution state, and investigation outcome. A finished operation is not a validated vulnerability.
- Known active work? MUST account for it before launching a replacement. Missing task-list entries, inaccessible sources, or absent results do not establish that execution never happened.
- MUST retain uncertainty when available evidence cannot resolve execution or completion; NEVER manufacture results or timestamps to close an experiment.
- NEVER restart, resend, cancel, or resume a native task merely because an OMP session resumed. Newly executed tests retain their own experiment provenance.

## Check evidence needed for continuation

- MUST read `skill://hunt-evidence` before checking artifact integrity or reconciling evidence registrations.
- MUST check the evidence needed for the next action and surface missing, partial, changed, or inaccessible artifacts without presenting them as verified copies.
- MUST distinguish registered evidence from unregistered files. Matching bytes alone do not establish the missing source context or record associations.
- MUST retain evidence gaps for reassessment rather than silently reconstructing an original capture from a new execution.

## Inspect the final report file

- MUST inspect the stable report path for each relevant finding, comparing its bytes with the stored export hash and its exported revision with the current report revision.
- MUST distinguish missing, changed, stale, or unconfirmed exports from current, submission-ready reports.
- A prepared export's `resume` verifies existing bytes and records the outcome without publishing. A saved export receipt remains historical even if the file later disappears or changes; inspect the returned file observation separately.
- Regeneration is a separate `hunt-report` operation; NEVER rewrite a report file merely because a session resumed.

## Reconcile report synchronization

- MUST read `skill://caido-findings` before inspecting native findings. Resolve them using persisted instance/project context, IDs, and deduplication identity—not titles alone.
- MUST compare current owned title/description fields with the stored intended report revision and the latest local report/link state.
- Matching intended content establishes observed confirmation, not proof of which writer performed the mutation. Confirmation of an older attempt does not make its report current.
- MUST distinguish historical sync-attempt outcomes from the current finding’s synchronization and readiness state.
- Different content, a missing finding, or ambiguous creation results? MUST retain the relevant conflict or uncertainty; NEVER automatically overwrite, adopt, recreate, or repeat the mutation.
- Reconciliation uses native read operations.
- New report mutations are separate operations. MUST read `skill://hunt-report` before them, unless already in context.

## Persist and continue

- For continuation, MUST read `skill://hunt-record` before saving reconstructed model, investigation, contradiction, verification, or experiment state.
- MUST persist supported reconciliations through the shared writer and record owners, preserving revision checks, report history, and the shared checkpoint boundaries. These writes do not apply to read-only inspection.
- MUST select the next action from current objectives, supported evidence, and unresolved prerequisites—not automatically repeat the last command.
- MUST keep dependent work blocked where its prerequisite remains unresolved; SHOULD continue independent eligible work.
- For a continuation request, MUST proceed through `skill://hunt-methodology` once the necessary context is established; read it unless already in context. A reconstructed plan alone is not resumed investigation work.

## Return

- MUST follow the concise-summary rules in `skill://dolt-access`.
- MUST summarize material reconstructed-state changes, reconciliation outcomes,
  and unresolved blockers, conflicts, or evidence/report/synchronization gaps.
- A continuation request requires resumed work, not only a status summary.

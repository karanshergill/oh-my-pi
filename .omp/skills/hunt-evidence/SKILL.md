---
name: hunt-evidence
description: Use when preserving investigation-relevant artifacts, registering evidence provenance, checking integrity, or producing redacted and transformed evidence copies.
---

# Hunt Evidence

MUST read `skill://dolt-access` unless already in context.

## Responsibility

- MUST maintain evidence records and immutable artifact copies under the shared record contract.
- Investigation assessments and report composition remain separate. Preserved bytes do not establish target execution, a vulnerability, or report readiness.

## Select material for preservation

- MUST preserve investigation-relevant artifacts, including supporting results, contradictory results, baselines, and controls needed to interpret the investigation.
- MUST retain the context needed to associate results with inputs, identities, state, ordering, and observation windows.
- MUST preserve complete relevant sequences or measurement sets when sampling would distort the conclusion; NEVER cherry-pick successful or extreme results while excluding relevant controls or counterevidence.
- MUST record the selection and inspected coverage. Partial or filtered acquisition is not a complete campaign archive.
- Selection governs local preservation; it does not delete other Caido history or change its retention.

## Acquire from the correct source

MUST read the owning skill before its acquisition operations, unless already in context.

| Source | Owning skill |
|---|---|
| Captured HTTP exchanges and their edit variants | `skill://caido-requests` |
| Captured WebSocket messages and versions | `skill://caido-websockets` |
| Replay inputs, execution entries, and associated captures | `skill://caido-replay` |
| Automate runs, payload/result associations, and exports | `skill://caido-automate` |
| Native export lifecycle and artifact downloads | `skill://caido-exports` |
| JxScout assets, source maps, analysis matches, wordlists, and CLI output | `skill://jxscout-access` |
| REA captures, analysis Evidence, script exports, and Evidence bundles | `skill://rea-access` |

- MUST retain the Caido instance, project, native object IDs, and chosen variant. For other sources, retain the producing tool/version, project/session/run, and source context when available.
- MUST distinguish captured results from drafts, imported or synthetic data, and rendered views.
- MUST record acquisition time separately from known event/capture times; NEVER invent missing timestamps.
- Unavailable evidence? MUST record the gap. New execution or active rendering is a separate operation with its own provenance, not recovery of the original capture.
- Cross-tool handoff? MUST verify the receiving operation accepts the representation and retain any conversion lineage.

## Preserve bytes and fidelity

- MUST preserve the bytes exposed by the chosen source and identify their representation. Rendered previews and pretty formatting are not substitutes for original bytes.
- MUST decode transport encodings as bytes without lossy text conversion. Keep export containers when extracting evidence from them and link extracted artifacts to their source.
- MUST distinguish absent, omitted, truncated, and genuinely empty data.
- MUST record capture limitations and transformations; an API field named `raw` does not establish packet-level fidelity or an atomic snapshot.
- NEVER execute captured content as part of preservation or integrity checks.

## Store and register evidence

- MUST use `hunt` action `preserve` with explicit engagement/operation IDs and an absolute selected source path. Native acquisition/download remains a separate operation.
- New evidence? Use `evidence.mode=create`, a stable evidence ID, and provenance/capture fields. The tool computes the stored path, byte count, SHA-256, and local-preservation state.
- Existing evidence? Use `evidence.mode=update`, its ID, and current revision. Recorded capture hashes/counts must match; source provenance and completeness claims remain unchanged.
- Existing artifact integrity mismatch? MUST report it; NEVER silently overwrite the mismatching artifact.
- MUST save native IDs/variants and evidence relationships with `hunt` action `save`; a source filename does not establish native provenance.
- New derivative? MUST create its evidence record and original-evidence links in one `save` batch before `preserve` in update mode.
- MUST retain links to relevant hunt records using stable IDs.
- MUST distinguish source-only references, verified local copies, and partial evidence. A valid hash does not establish source authenticity, completeness, or security impact.
- MUST report file preservation and Dolt registration/checkpoint outcomes separately. A completed file write followed by a failed registration is not a completed evidence save.
- On identical-operation retry, `preserve` verifies the recorded artifact without recopying the source. Missing or corrupt stored bytes require reconciliation, not silent repair.
- `resume` reconciles SQL/checkpoint state only. Interrupted or failed registration may leave unregistered immutable bytes or private temporary files; NEVER delete them on an assumed rollback.

## Originals, derivatives, and corrections

- MUST keep originals unchanged. Redaction or content transformation creates a separate artifact with its own digest and a link describing the transformation.
- MUST describe redactions without copying removed secrets into metadata or output.
- Identical bytes MAY share an artifact; distinct source events or contexts MUST retain their own provenance. NEVER merge observations solely because their hashes match.
- MUST preserve provenance-correction history and surface affected record links for reassessment.

## Return

- MUST follow the concise-summary rules in `skill://dolt-access`.
- MUST distinguish file preservation from Dolt registration/checkpoint status
  and surface material coverage/fidelity gaps.
- NEVER present a source reference alone as a durable local copy.

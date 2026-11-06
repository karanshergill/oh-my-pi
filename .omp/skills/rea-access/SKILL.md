---
name: rea-access
description: "Checkout-local REA access and vendor workflows for shipped JavaScript, browser/runtime evidence, packaged applications, and native targets. Use when REA analysis can answer the current investigation question."
---

# REA Access

## Vendor workflow

- MUST read the [official REA skill](references/upstream/SKILL.md) before REA operations, unless already in context.
- MUST resolve its relative references from the upstream skill directory.
- Snapshot version, source, and file hashes: [source.json](references/upstream/source.json).
- MUST match guidance to the selected runtime; actual connected schemas remain authoritative.
- Version mismatch? MUST use that runtime's matching guidance, not assume this snapshot describes its capabilities.

## Checkout integration

- MUST reuse configured checkout-local MCP access or the selected checkout-local CLI.
- MUST keep OMP configuration, skills, and runtime changes inside this checkout.
- NEVER modify the installed OMP or global agent configuration.
- MUST present a diff and obtain approval before installation or registration changes.
- NEVER run vendor setup, self-update, or package-acquisition examples implicitly.
- NEVER reload or restart the running OMP as an implicit repair.
- MUST use headless operations; GUI-only providers are not substitutes.
- Missing runtime or provider? MUST report the specific prerequisite and continue independent supported work.

## Long-running operations

- MUST use per-server `timeout: 0` when registering REA; preserve unrelated server settings.
- Before long-running calls, MUST check the running OMP process for `OMP_MCP_TIMEOUT_MS`. A positive value overrides `timeout: 0`; MUST report it without changing it implicitly.
- A positive client deadline MUST cover the complete multi-source operation plus cleanup and delivery, not just one source's budget.
- REA operation deadlines remain independent; MUST identify the deadline owner before adjusting limits.

### Large JavaScript application sources

- Known large sources, or an exhausted 300000 ms source deadline? MUST pass `analysis_timeout_ms: 3600000` (one hour per source) to `analyze_javascript_application`; CLI: `--analysis-timeout-ms 3600000`.
- Ordinary analyses retain normal budgets. Other operations, including `analyze_web_bundle`, retain their own budget rules.
- One hour is an initial budget, not a completion guarantee. Need more? MUST choose a larger supported positive per-call value; `0` is not unlimited.
- On a REA source timeout, MUST retain and reuse available partial Evidence, resolve reported incomplete cleanup, and retry only still-needed analysis with a larger budget.
- NEVER silently omit requested sources or lower semantic limits to fit a deadline. `detail: "summary"` reduces response size, not analysis work.

## Hunt handoff

- MUST read `skill://hunt-record` before updating investigation records, unless already in context.
- MUST read `skill://hunt-evidence` before preserving artifacts, unless already in context.
- REA Evidence IDs remain producer references, not canonical hunt-record IDs or durable artifact copies.

---
name: jxscout-access
description: "Headless JxScout Pro v2 access, project-generated vendor guidance, web-asset acquisition, and AST/regex analysis. Use for captured assets, source maps, chunks, matches, or wordlists."
---

# JxScout Access

## CLI and project

- MUST use the existing JxScout Pro v2 CLI: `-c` for client commands; `--headless` for approved server startup. NEVER operate the GUI/TUI.
- Installed VPS CLI: `/home/me/oh-my-pi/.omp/runtime/jxscout/jxscout-pro-v2`.
- Before using the short command name, source
  `/home/me/oh-my-pi/.omp/runtime/env.sh` in the same shell.
- `command not found`? MUST check the installed executable with `--version`
  before declaring the CLI unavailable. Use its absolute path or load the
  runtime environment; a failed PATH lookup does not mean it is uninstalled.
- NEVER reinstall, rebuild, or implement a replacement solely to resolve
  a command-lookup failure.
- SHOULD use `jxscout-pro-v2 -c --help` when command details are missing.
- MUST resolve the intended project and absolute project directory from actual context or CLI metadata, not OMP's working directory.
- Ambiguous project? MUST resolve the selection before project-bound commands.
- MUST verify the selected project exists before project-bound commands.
- Server-dependent command? MUST verify a running instance belongs to that project and resolve its actual endpoint.
- CLI unavailable, project missing, or required server stopped?
  MUST report the specific prerequisite and continue supported independent work.
- MUST check `ingestion.scope.match_full_url` before choosing patterns: `false` matches hostnames, ignoring scheme, port, and path; `true` matches full URLs.
- NEVER assume JxScout ingestion filters or proxy traffic are synchronized with Caido.

## Persistent headless service

- Use `.omp/scripts/omp-jxscout@.service`, with the canonical engagement ID as its instance name.
- Configure `JXSCOUT_PROJECT_NAME` and `JXSCOUT_PROXY_PORT` in `.omp/hunts/engagements/<engagement-id>/work/jxscout/server.env`. MUST verify the project's directory and endpoint match the engagement's native-tool association.
- MUST use distinct loopback ports for concurrent instances. Keep scope in each project's settings, not the shared service template.
- Before stopping an instance, MUST disable any Caido upstream rule that depends on it.

## Live capture through Caido

- MUST read `skill://caido-proxy` before changing capture routing.
- For scoped upstream capture, route the engagement's authorized research hosts from Caido to its verified JXScout endpoint. Caido upstream rules are instance-wide; MUST account for existing rules and overlapping hosts.
- NEVER point JXScout back at Caido while Caido uses it as an upstream. With no JXScout upstream configured, JXScout-initiated discovery goes directly to origins and is not captured by Caido.
- MUST verify actual `PROXY` ingestion and completed processing. Saved configuration or filesystem ingestion alone does not establish live capture.

## Project-generated vendor guidance

- MUST locate and read relevant generated `SKILL.md` files in the selected project before their workflows, unless already in context.
- `agent_skills.agents_folder_name` controls the agent folder; MUST resolve its actual location rather than assume `.agents`.
- MUST resolve relative references against each generated skill's directory.
- Outside OMP discovery roots? MUST read the files directly; NEVER assume a `skill://` registration exists.
- MUST keep target-specific generated skills in their project, not copy them into this fork or global skill directories implicitly.
- Missing generated guidance? MUST report the gap and use installed CLI help for supported work; public sample skills are not the complete Pro catalog.

## Integration boundaries

- MUST keep OMP integration changes inside this checkout; NEVER modify installed OMP or global agent configuration.
- MUST present a diff and obtain approval before integration configuration or installation changes.
- NEVER change global JxScout settings, enable skill generation, or install software implicitly.
- MUST account for configured hooks, monitoring, and discovery before operations that can generate target activity.

## Result ownership

- `fs-ingest` requires the selected project to be running; filesystem ingestion does not discover source maps or chunks.
- MUST pass `--include-hidden` when `fs-ingest` reads assets under `.omp`; keep `--folder` pointed at the intended asset directory.
- `analyze` outputs matches without adding them to the project database; command output is not a persisted project result.
- MUST reconcile ingestion counts with the intended inputs and verify completed processing; `ok` alone does not establish success.

## Hunt handoff

- MUST read `skill://hunt-record` before updating investigation records, unless already in context.
- MUST read `skill://hunt-evidence` before preserving artifacts, unless already in context.
- MUST read `skill://hunt-report` before composing or synchronizing reports, including vendor-generated finding drafts, unless already in context.
- JxScout assets, matches, and native findings remain producer records; canonical investigation and report state belongs to the hunt skills.

Vendor references: [Agent skills](https://docs.v2.jxscout.app/docs/tutorial/agent-skills), [Analyzer](https://docs.v2.jxscout.app/docs/tutorial/analyzer#ad-hoc-testing), [Filesystem ingestion](https://docs.v2.jxscout.app/docs/tutorial/file-system-ingestion), [Scope](https://docs.v2.jxscout.app/docs/tutorial/basic-features#scope).

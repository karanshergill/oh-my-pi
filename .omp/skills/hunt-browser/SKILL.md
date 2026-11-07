---
name: hunt-browser
description: Use for authorized target browsing through OMP's Chrome DevTools MCP, engagement browser isolation, Caido capture verification, or recovery and relaunch of the agent browser.
---

# Hunt Browser

MUST read `skill://chrome-devtools` before operating its MCP tools unless already in context. For connection or navigation failures, read `skill://troubleshooting`; keep this engagement's dedicated profile and Caido proxy instead of following generic `npx`, `--autoConnect`, or `--browserUrl` suggestions. Use `skill://cookie-debugging` when investigating cookie or session behavior.

## Choose the browser

- Resolve the active engagement ID, directory, and Caido project before target traffic. Ambiguous context? Inspect records; NEVER reuse another engagement's browser profile or project.
- Use OMP's `chrome-devtools` MCP server, not the separate Chrome DevTools CLI or a human/REA browser. The agent browser is distinct from the human's Chrome.
- Give each engagement a distinct `HOME` and `--userDataDir`, derived from its engagement directory, not its display name. Reuse that profile only for the same engagement. Named `new_page.isolatedContext` values provide temporary cookie isolation, not a second persistent profile.

## Configure on the current VPS

- For the current VPS display and viewer wiring, read `docs/hunt-vps-runtime.md` before changing `DISPLAY` or restarting Tern.
- Read the current `.omp/mcp.json` `chrome-devtools` entry and verify the intended Caido listener with `skill://caido-proxy`. Its Node command, MCP entrypoint, Chrome executable, and proxy address are machine-specific; NEVER copy them from another installation or engagement.
- For an approved visible, persistent setup: omit `--headless=true` and `--isolated=true`; set `DISPLAY`, `XAUTHORITY`, and `XDG_RUNTIME_DIR` for the actual display; set `HOME=<engagement-directory>/work/browser/home` and `--userDataDir=<engagement-directory>/work/browser/profile`. Retain the verified `--executablePath`, `--proxyServer`, `--no-usage-statistics`, `--no-performance-crux`, and configured filesystem roots; set `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`. Change only this MCP server's entry.
- Browser display variables select the visible desktop; `HOME` holds the dedicated CA trust database; `--userDataDir` persists engagement cookies. `--proxyServer` routes browser traffic to Caido. `--no-usage-statistics` disables MCP telemetry, not Chrome's own metrics; `--no-performance-crux` prevents trace URLs reaching CrUX; the update-check variable avoids background registry lookups. `--workspace=/`, if configured, grants VPS-wide MCP file-tool access and is not an authorization or network boundary.
- Trust Caido's public CA in that dedicated `HOME` NSS database before proxied HTTPS. NEVER substitute `--acceptInsecureCerts` or silently change system-wide trust. Follow `skill://caido-requests` for History correlation.

## Relaunch and check

- Unchanged `.omp/mcp.json`? Run `/mcp reconnect chrome-devtools` in interactive OMP. Changed `.omp/mcp.json`? Run `/mcp reload` to rediscover it; this reloads all MCP servers. Check `/mcp list` afterward. These are OMP commands, not shell commands.
- NEVER start the equivalent Node command beside a running OMP server or share its profile with another Chrome process.
- Call `list_pages` to start/check the MCP browser; confirm the intended visible display. For target readiness, use an authorized request, verify TLS, and confirm its exchange in the selected Caido project's HTTP History. A loaded page alone does not prove proxy capture.
- Before switching engagements, select the new Caido project and unique browser directories, update the local MCP entry, then reload. Keep the old profile for that engagement; do not carry cookies across projects. Simultaneous persistent identities need separate MCP servers and profile directories.

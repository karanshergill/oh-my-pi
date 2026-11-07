# VPS hunt browser runtime

This describes the current VPS setup. Machine-specific browser settings stay in the ignored `.omp/mcp.json`; engagement profiles and credentials are not fork content.

## What runs where

- `caido-cli --no-open` runs as `me` on `127.0.0.1:8080`. It serves the proxy, API, and web GUI. The user opens that GUI in a **local** browser over an SSH tunnel; no Caido Desktop GUI runs on the VPS. Agents use the Caido SDK/API through `skill://caido-access`, not the GUI.
- OMP's `chrome-devtools` MCP server launches headed `/usr/bin/google-chrome-stable` with an engagement-specific `HOME` and `--userDataDir`. Its `--proxyServer=http://127.0.0.1:8080` routes browser traffic through the existing Caido listener. The browser still needs the engagement home's trust of Caido's public CA for intercepted HTTPS; see `skill://hunt-browser`.
- Tern Screen shows and controls that Chrome in a browser-based Tern viewer. Tern's built-in browser block does **not** run in the web viewer and is not a substitute for Chrome DevTools MCP. KasmVNC is installed but its `kasmvnc-me.service` is disabled and inactive.

## Display and viewer

The `me` user service `~/.config/systemd/user/tern-virtual-display.service` starts Xvfb `:2` (1920×1080×24) and `xfwm4` together. Its Xauthority file is `/run/user/1000/tern-screen-xauth`. The drop-in `~/.config/systemd/user/tern-remote.service.d/display.conf` orders `tern-remote.service` after that display and supplies `DISPLAY=:2` and the same `XAUTHORITY` to Tern's daemon.

The existing browser viewer is `tern web serve --listen 127.0.0.1:18737`. It is a separately started Tern process, **not** a systemd service: after a reboot, start it only if it is absent. Forward its loopback port over SSH to a free port on your computer, then open the authenticated URL Tern prints in your local browser. The remote Tern service and virtual-display service are enabled for the `me` user; the web viewer is not. Use Tern Screen's **Control** switch for input.

The local-browser Caido GUI likewise uses an SSH tunnel to the VPS's `127.0.0.1:8080`. Opening it does not create a second Caido instance. Do not launch Caido Desktop on the VPS just to see its GUI.

## Check or recover

On the VPS as `me`:

```sh
systemctl --user is-active tern-remote.service tern-virtual-display.service
DISPLAY=:2 XAUTHORITY=/run/user/1000/tern-screen-xauth xrandr --listmonitors
ss -lntp '( sport = :8080 or sport = :18737 )'
```

The first two services should be active; Xvfb should expose one screen. Caido should listen on `127.0.0.1:8080`, and the Tern web viewer on `127.0.0.1:18737` when started. `systemctl is-enabled kasmvnc-me.service` should report `disabled`. If the web viewer is missing, start `tern web serve --listen 127.0.0.1:18737` on the VPS and use its printed authenticated URL through your SSH tunnel. Do not restart the Tern daemon merely to reconnect the web viewer: a daemon restart interrupts the OMP process and may require resuming its session.

Before browser target traffic, follow `skill://hunt-browser`: verify the current engagement's ignored `.omp/mcp.json` values rather than copying a previous engagement's profile. After editing that file, run `/mcp reload` in OMP; use `list_pages` to check browser launch, then verify an authorized exchange in the selected Caido project's HTTP History. A visible page or proxy flag alone does not prove Caido captured traffic.

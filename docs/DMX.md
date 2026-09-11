# DMX in Shoedelussy

## Overview

Shoedelussy includes a development-first DMX control path built around a standalone bridge at `bridges/dmx-mcp/`.

Current supported backends:

- `simulator`
- `ola`

Current UI support:

- HAL/DMX visualization switching
- DMX Monitor sidebar panel
- scene triggering
- group intensity and RGBW control
- section -> scene bindings
- track -> group bindings
- active lighting status in transport/editor UI
- frontend DMX help in the Learn panel and help overlay

## Architecture

- Shoedelussy stores musical and project-side lighting metadata.
- `bridges/dmx-mcp` owns DMX transport, patch loading, state, and control actions.
- Agents can use MCP tools against the bridge.
- The frontend talks to the bridge over local HTTP for live monitoring and control.
- UI bridge access is opt-in via `VITE_DMX_BRIDGE_URL`; when unset, the app does not poll localhost and DMX stays disabled in the UI.

## Public Demo Rig

Shoedelussy also has a fake bridge-compatible DMX rig at:

- `https://dmxdemo.ussyco.de`
- all-in-one recording view: `https://dmxdemo.ussyco.de/jam`

Use it for no-hardware jams and screenshots:

- open `https://dmxdemo.ussyco.de` in one browser tab to watch the fake lighting layout
- or open `https://dmxdemo.ussyco.de/jam` to see Shoedelussy and the fake lighting rig side by side in one page
- point Shoedelussy at it with `VITE_DMX_BRIDGE_URL=https://dmxdemo.ussyco.de`
- use the DMX Monitor, section cue bindings, track group bindings, or scene buttons from `strudel.ussyco.de` / `shoe.ussyco.de`
- the hosted Shoedelussy build defaults to this public demo rig unless `VITE_DMX_BRIDGE_URL` is overridden at build time
- the demo implements `/state`, `/patch`, `/scenes`, `/scenes/apply`, `/control/arm`, `/control/disarm`, `/control/blackout`, and `/control/group`

The demo is served by `scripts/dmx_demo_site.py` on `127.0.0.1:9512` and proxied through the existing `dmxdemo.ussyco.de` subdomain route. It sends permissive CORS headers so the hosted Shoedelussy UI can write to it from another subdomain.

### Recording The Demo

Fast path:

1. Open `https://dmxdemo.ussyco.de/jam`.
2. Press Play in the left Shoedelussy pane.
3. Record the page; the fake rig is already visible in the right pane.

Two-window path:

1. Open `https://dmxdemo.ussyco.de` in one browser window and make it visible in the recording.
2. Open `https://strudel.ussyco.de/?template=demo` or `https://shoe.ussyco.de/?template=demo` in another window.
3. Click `Load Demo` if you are not already on the demo project.
4. Press Play in Shoedelussy.
5. The default demo project has named Strudel tracks wired to the fake rig:
   - `kick$:` -> `strobes`
   - `snare$:` -> `front_wash`
   - `floor$:` -> `floor`
   - `lead$:` -> `all_wash`
   - `beam$:` -> `back_beams`
6. Section markers also trigger scenes:
   - `intro` -> `front_warm`
   - `drop` -> `club_purple`
   - `breakdown` -> `back_blue`

## Bridge

Path:

- `bridges/dmx-mcp/`

Start it with:

```bash
cd bridges/dmx-mcp
pnpm start
```

Use OLA with:

```bash
cd bridges/dmx-mcp
DMX_BACKEND=ola pnpm start
```

Optional HTTP auth for mutating bridge routes:

```bash
cd bridges/dmx-mcp
DMX_HTTP_TOKEN=your-token pnpm start
```

When `DMX_HTTP_TOKEN` is set, bridge `POST` routes require `Authorization: Bearer <token>`.

## Patch File

Default patch file:

- `bridges/dmx-mcp/config/patch.json`

Configure a different patch file with:

- `DMX_PATCH_PATH`

Patch model currently includes:

- one universe
- named fixtures
- named groups

Patch files are validated on load, and the checked-in default patch uses two 5-channel RGBW wash fixtures:

- `wash_left`: channels `1-5`
- `wash_right`: channels `6-10`

## HTTP Endpoints

- `GET /health`
- `GET /state`
- `GET /patch`
- `GET /scenes`
- `POST /scenes/apply`
- `POST /control/arm`
- `POST /control/disarm`
- `POST /control/blackout`
- `POST /control/group`

Auth note:

- `GET /health` and `GET /state` are always readable without a bearer token
- if `DMX_HTTP_TOKEN` is set, all bridge `POST` routes require bearer auth

## MCP Tools

- `list_scenes`
- `list_groups`
- `arm_output`
- `disarm_output`
- `blackout`
- `apply_scene`
- `set_group_state`

## UI

### DMX Monitor

Location:

- right sidebar -> `DMX Monitor`

Capabilities:

- bridge reachability and backend/patch status
- patch inspection
- scene trigger buttons
- arm/disarm/blackout controls
- group intensity control
- group RGBW control
- section -> scene bindings
- track -> group bindings

### Visualization

Switch the center visualization between:

- `HAL`
- `DMX`

The DMX mode renders bridge state instead of audio FFT data.

## Bindings

Bindings are persisted in project metadata under `lighting`.

### Section to Scene

- source: `// [section]` markers in code
- target: DMX scenes

### Track to Group

- source: named `$:` tracks
- target: DMX groups
- optional binding controls: `intensity` and `hold_ms`
- optional binding control: `fade_ms`

## Automatic Lighting Behavior

- when playback is active and the project has cue bindings, the active section can trigger its bound DMX scene
- when playback is active and the project has group bindings, runtime-queried named track activity can drive DMX group updates
- track->group automation is currently onset-pulse based: it sends an intensity bump and then auto-releases after the binding hold time
- fade-out behavior can be shaped with per-binding `fade_ms`

Current note: track binding execution now uses real runtime trigger events and source-location matching to named tracks, with per-binding `intensity` and `hold_ms`, but it is still an onset-driven mapping layer rather than a full event-to-light parameter system.

### Pulse Presets

The DMX Monitor includes compact presets for common pulse shapes:

- `Kick`
- `Snare`
- `Hat`
- `Pad`
- `Stab`

These presets write tuned `intensity`, `hold_ms`, and `fade_ms` values into the selected track binding.

### Automation Status

The DMX Monitor shows currently pulsing groups with:

- source track name
- intensity
- remaining hold time

## Safety

- output starts disarmed by default
- live non-simulator output is gated by explicit arming
- blackout is explicit and always available
- simulator mode is preferred for development
- raw unrestricted channel writes are not the primary UI surface
- OLA verifies connectivity during startup and fails fast if its JSON API is unreachable
- bridge writes are throttled to `DMX_MAX_FPS`

## Live Help

DMX help is available in:

- the Learn/Tutorial panel
- the keyboard/help overlay

Look for the `DMX & Lighting Control` tutorial chapter.

## Current Limitations

- no direct `sACN` backend yet
- no multi-universe support yet
- no fade-time binding editor yet
- runtime track activity still works best with explicit named tracks and currently maps onset activity rather than richer musical parameters
- automation currently releases intensity back to `0` after `hold_ms` and does not yet derive color/intensity from musical event payloads

## Next Steps

1. Add direct `sACN` backend.
2. Add multi-universe patch support.
3. Add fade/transition controls to bindings.
4. Improve runtime track activity detection with deeper Strudel event introspection.

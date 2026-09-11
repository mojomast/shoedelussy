# dmx-mcp

`dmx-mcp` is Shoedelussy's local DMX bridge. The Shoedelussy UI talks to it over HTTP, the bridge resolves scenes and group writes against a patch, and then forwards those writes to either the built-in simulator or an OLA-backed hardware path.

## Prerequisites

- Node.js >= 20
- `pnpm`
- OLA for hardware mode, or simulator mode for a no-hardware setup

## Quick Start (Simulator Mode)

1. `cd bridges/dmx-mcp && pnpm install`
2. `cp .env.example .env`
3. `pnpm dev`
4. Verify the bridge is up: `curl http://127.0.0.1:3334/health`
5. Set `VITE_DMX_BRIDGE_URL=http://127.0.0.1:3334` in `ui/.env.local`
6. Start the UI, then open the `DMX Monitor` section in the `DawPanel`

You can use `pnpm start` instead of `pnpm dev` if preferred.

## Public No-Hardware Demo

For jams where you want visible lights without running the local bridge, use:

- `https://dmxdemo.ussyco.de`

Open that URL to watch the fake rig, and point the Shoedelussy UI at it with:

```bash
VITE_DMX_BRIDGE_URL=https://dmxdemo.ussyco.de
```

The demo endpoint implements the same core HTTP contract as this bridge, so scene triggers, group writes, and automation pulses from `strudel.ussyco.de` or `shoe.ussyco.de` update the fake stage.

## Quick Start (OLA Mode)

1. Install OLA: <https://www.openlighting.org/ola/getting-started/>
2. Start `olad`
3. Set `DMX_BACKEND=ola` in `bridges/dmx-mcp/.env`
4. Set `OLA_BASE_URL` too if your OLA JSON API is not on the default `http://127.0.0.1:9090`
5. Run `pnpm dev`
6. Arm the bridge before writing, either by setting `DMX_OUTPUT_ARMED=true` or by using the `Arm` button in the UI

## Smoke Test

Run:

```bash
pnpm smoke
```

This starts the bridge in simulator mode, waits for `/health`, applies `full_white`, verifies channel 1 lights up, blackouts, verifies channel 1 returns to `0`, and then shuts the child process down.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DMX_MCP_HOST` | `127.0.0.1` | Host address for the bridge HTTP server |
| `DMX_MCP_PORT` | `3334` | Port for the bridge HTTP server |
| `OLA_BASE_URL` | `http://127.0.0.1:9090` | Base URL for the OLA JSON API |
| `DMX_PATCH_PATH` | `bridges/dmx-mcp/config/patch.json` | Path to the DMX patch JSON file |
| `DMX_BACKEND` | `simulator` | Backend name: `simulator`, `ola`, `sacn`, or `artnet` |
| `DMX_SAFE_MODE` | `true` | Throws on safety issues like unknown fixtures in a group when enabled |
| `DMX_OUTPUT_ARMED` | `false` | Initial output armed state |
| `DMX_ALLOWED_UNIVERSES` | `1` | Comma-separated allowed universe list |
| `DMX_MAX_FPS` | `30` | Maximum bridge write rate |
| `DMX_HTTP_TOKEN` | unset | Optional bearer token required for bridge `POST` routes |

## MCP Tools Reference

| Tool | Description | Required Inputs |
| --- | --- | --- |
| `list_scenes` | Lists built-in demo scenes | none |
| `list_groups` | Lists named groups from the active patch | none |
| `arm_output` | Arms DMX output | `idempotency_key` |
| `disarm_output` | Disarms DMX output | `idempotency_key` |
| `blackout` | Zeroes desired output immediately | `idempotency_key` |
| `apply_scene` | Applies a built-in scene to its target group | `scene_id`, `idempotency_key` |
| `set_group_state` | Writes intensity and/or color values to a named group | `group_id`, `idempotency_key` |

Optional MCP tool inputs:

- `dry_run` on all mutating tools
- `intensity`, `red`, `green`, `blue`, `white` on `set_group_state`

## HTTP API Reference

| Method + Path | Description | Body |
| --- | --- | --- |
| `GET /health` | Returns bridge health and connection info | none |
| `GET /state` | Returns current visualization state, patch, scenes, and observed universe | none |
| `GET /patch` | Returns the active patch model | none |
| `GET /scenes` | Returns built-in scenes | none |
| `POST /scenes/apply` | Applies a built-in scene | `{ "scene_id": string, "idempotency_key"?: string }` |
| `POST /control/arm` | Arms the bridge | `{ "idempotency_key"?: string }` |
| `POST /control/disarm` | Disarms the bridge | `{ "idempotency_key"?: string }` |
| `POST /control/blackout` | Writes a zero frame | `{ "idempotency_key"?: string }` |
| `POST /control/group` | Writes named channel values to a group | `{ "group_id": string, "idempotency_key"?: string, "intensity"?: number, "red"?: number, "green"?: number, "blue"?: number, "white"?: number }` |

HTTP auth behavior:

- `GET /health` and `GET /state` stay unauthenticated
- when `DMX_HTTP_TOKEN` is set, all `POST` routes require `Authorization: Bearer <token>`

## Patch Format

The patch file defines the active universe, fixtures, and groups. Fixtures use a named-channel personality map, and that map is the source of truth for channel layout.

```jsonc
{
  "universe": 1,
  "fixtures": [
    {
      "id": "wash_left",          // stable fixture id
      "label": "Wash Left",       // human-readable label
      "personality": {
        "intensity": 1,            // logical channel name -> DMX channel number
        "red": 2,
        "green": 3,
        "blue": 4,
        "white": 5
      },
      "group_ids": ["all_washes", "frontline"]
    }
  ],
  "groups": [
    {
      "id": "all_washes",        // stable group id
      "label": "All Washes",     // human-readable label
      "fixture_ids": ["wash_left"]
    }
  ]
}
```

Field notes:

- `universe`: the DMX universe this patch writes to
- `fixtures`: fixture records with `id`, `label`, `personality`, and `group_ids`
- `personality`: a map of logical channel names to 1-indexed DMX channel numbers
- `groups`: named collections of fixture ids used by scenes and group writes

Compatibility note:

- the bridge still derives a sorted `channels[]` array for consumers that read it, but `personality` is the real source of truth

## Scenes

`DEMO_SCENES` live in `src/scenes.ts`. Each scene targets a named group and supplies logical values such as `intensity`, `red`, `green`, `blue`, and `white`. The bridge resolves those logical values through each fixture's `personality` map when rendering the output frame.

To add a new scene:

1. Open `src/scenes.ts`
2. Add a new entry to `DEMO_SCENES`
3. Give it an `id`, `label`, `target_group_id`, and `values`
4. Restart the bridge

Current limitation:

- scenes are compiled in; they are not hot-reloaded from disk

## Architecture Diagram

```text
Shoedelussy UI
    |
    | HTTP
    v
DmxBridgeService
    |
    +--> DmxStateStore
    |
    +--> DmxBackend
            |
            +--> Simulator backend
            |
            +--> OLA backend
                    |
                    v
                 DMX hardware
```

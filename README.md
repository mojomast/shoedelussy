# strudelussy

`strudelussy` is a DAW-style fork of Toaster for building Strudel projects with an AI copilot.

Upstream credit: this repo extends [VoloBuilds/toaster](https://github.com/VoloBuilds/toaster), and keeps large parts of the original editor/runtime workflow intact while layering DAW-oriented orchestration on top.

This repo now includes a working MVP built on top of the upstream toaster codebase:

- DAW-style single-project workspace
- diff-aware AI chat flow with Apply/Reject review
- streaming AI chat flow with live assistant typing, preview/apply/reject review, and per-message pending diffs
- live Strudel editor and playback using the existing `StrudelEditor.tsx`
- parsed BPM, key, sections, and a per-track gain/pan mixer from live code
- guest-mode local persistence plus server-side KV-backed project persistence
- projects gallery route, clean public `/share/:id` remix links, share/export basics, and version restore UI
- explicit `New Project` and `Load Demo` flows
- rhythm generator with per-voice gain, arrange mask, FX rack with explicit on/off filter states, mutate toolbar, keyboard shortcuts overlay, BPM tap tempo, and a visible model selector
- public host runtime for `strudel.ussyco.de`
- fake public DMX demo rig at `dmxdemo.ussyco.de`

The full long-form spec remains in `docs/SPEC_TOASTER_DAW.md`. This implementation intentionally focuses on the first coherent vertical slice rather than the entire spec at once.

## Repository Structure

- `ui/` React + Vite frontend
- `server/` Cloudflare Workers + Hono API
- `docs/` specs and implementation notes

## Implemented MVP

### Frontend

- `HomePage` is now a DAW shell with:
- project topbar
- AI chat panel
- diff preview cards
- Strudel editor panel
- visualization/transport strip
- section strip parsed from `// [section]` comments
- per-track mixer panel that edits `gain()` and `pan()` live in the code
- rhythm generator with per-voice gain, arrange mask, FX rack with explicit on/off filter states, mutate toolbar, keyboard shortcuts overlay, BPM tap tempo, and a visible model selector
- version history panel with refresh and restore
- topbar actions for starting a blank project or reloading the demo template
- viewport-first responsive layout with earlier panel stacking and internal scrolling, including a scrollable editor column so lower DAW panels stay reachable
- lightweight project state is handled with Zustand
- guest-mode projects are stored in `localStorage`
- `/projects` lists locally stored projects and attempts remote project listing when available

### Backend

- `POST /api/chat` streams SSE chunks, then finishes with the existing structured `AIResponse` shape
- chat parsing is hardened so non-JSON model responses degrade into normal assistant messages instead of 500s
- chat history sent to the LLM is capped to the last 20 non-system messages
- oversized generated code is rejected with a structured assistant message instead of reaching the editor
- unsupported generated methods like `.bend()`, `.stutter()`, `.bounce()`, `.pingpong()`, `.trancegate()`, `.rlpf()`, and `.acidenv()` are stripped before code reaches the editor
- `GET/POST/PUT/DELETE /api/projects` provide KV-backed project persistence
- `GET/POST /api/projects/:id/versions` provide lightweight snapshot history
- `POST /api/share` creates deduplicated public share links at `/share/:id`; `GET /api/share/:id` returns read-only code plus lightweight metadata

## Still Deferred From The Full Spec

- Firebase auth and Supabase-backed persistence
- multi-panel resizing
- minimap and inline editor diff rendering
- authenticated multi-user gallery/workflows

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Cloudflare account if you want to deploy the API

### Install

```bash
git clone https://github.com/mojomast/strudelussy.git
cd strudelussy
pnpm install --dir ui
pnpm install --dir server
```

### Local Development

Backend:

```bash
cd server
cp .dev.vars.example .dev.vars
pnpm dev
```

Frontend:

```bash
cd ui
pnpm dev
```

Open `http://localhost:5173`.

Public runtime on the maintainer machine currently uses:

- `https://strudel.ussyco.de` for the app
- `https://dmxdemo.ussyco.de` for a fake bridge-compatible DMX lighting rig
- a local path-aware proxy that serves the built SPA and forwards `/api/*` to the worker on `:8788`
- `scripts/dmx_demo_site.py` on `127.0.0.1:9512`, proxied publicly by the `dmxdemo` webring subdomain
- live build scripts default `VITE_DMX_BRIDGE_URL` to `https://dmxdemo.ussyco.de` unless overridden

Recording demo:

- open `https://dmxdemo.ussyco.de/jam` for the all-in-one iframe recording view
- open `https://dmxdemo.ussyco.de` to show the fake lighting rig
- open `https://strudel.ussyco.de/?template=demo` or `https://shoe.ussyco.de/?template=demo`
- press Play; the demo project's named tracks and section markers are pre-bound to the fake rig

## Environment

Frontend `ui/.env`:

```bash
VITE_API_URL=http://localhost:8788
# Optional: point the UI at the public fake DMX rig
VITE_DMX_BRIDGE_URL=https://dmxdemo.ussyco.de
```

Backend `server/.dev.vars`:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash
APP_URL=http://localhost:5173
```

For persistent projects in the worker, also configure `PROJECTS_KV` and `SHARES_KV` in `server/wrangler.toml`.

## Verification

Frontend build:

```bash
cd ui
pnpm build
```

Server typecheck:

```bash
cd server
pnpm exec tsc --noEmit
```

## Docs

- `docs/SPEC_TOASTER_DAW.md` - source spec

# shoedelussy API

Cloudflare Workers + Hono backend for the shoedelussy MVP.

Upstream credit: this API layer builds on the forked [VoloBuilds/toaster](https://github.com/VoloBuilds/toaster) server structure and adapts it for the DAW/chat review flow.

## Implemented Endpoints

- `GET /` health check
- `POST /api/generate` legacy toaster generation route retained
- `POST /api/chat` streaming SSE chat endpoint for diff-aware code suggestions
- `GET /api/projects` list projects for `x-user-id`
- `POST /api/projects` create project
- `GET /api/projects/:id` load project
- `PUT /api/projects/:id` update project
- `DELETE /api/projects/:id` delete project
- `GET /api/projects/:id/versions` list snapshots
- `POST /api/projects/:id/versions` create snapshot
- `POST /api/share` create share link
- `GET /api/share/:id` load shared code

## Storage Model

Current MVP persistence is KV-backed:

- `SHARES_KV` for share links
- `PROJECTS_KV` for projects and versions

This is intentionally lighter than the full spec's planned Supabase model so the first end-to-end vertical slice can ship now.

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

## Required Configuration

`server/.dev.vars`:

```bash
# Default LLM provider (OpenAI-compatible). Example uses Requesty.
LLM_BASE_URL=https://router.requesty.ai/v1
LLM_API_KEY=...
LLM_MODEL=deepseek/deepseek-v4.1-flash
APP_URL=http://localhost:5173
```

`LLM_*` vars take precedence; the legacy `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` vars are still honored as a fallback when they are unset.

Production should use `APP_URL=https://strudel.ussyco.de`. The share API canonicalizes missing/local app URLs to `https://strudel.ussyco.de`, while CORS accepts both `strudel.ussyco.de` and the `shoe.ussyco.de` alias.

`server/wrangler.toml` also needs KV bindings for:

- `SHARES_KV`
- `PROJECTS_KV`

For the maintainer-hosted live site, this file is intentionally host-local and not committed. The live clone uses `server/wrangler.toml.example` as the template and fills in local KV ids + vars before starting the worker.

## Verification

```bash
pnpm exec tsc --noEmit
```

## Notes

- Auth is currently header-based (`x-user-id`) to support guest mode and unblock MVP persistence.
- The chat route streams incremental chunks and then ends with the existing structured `AIResponse` payload.
- The chat route now enforces a strict response contract with four required JSON fields: `message`, `code`, `diff_summary`, and `has_code_change`.
- The chat route degrades safely when the upstream model returns non-JSON text, malformed JSON, or schema-invalid JSON instead of the requested structured payload.
- The server resolves its default model from `LLM_MODEL` (falling back to `OPENROUTER_MODEL`, then `google/gemini-2.5-flash`) and its default provider from `LLM_BASE_URL` (falling back to OpenRouter).
- The chat route also proxies custom endpoint + API key overrides from the UI.
- `POST /api/chat/models` loads available model ids from a custom provider's `/models` endpoint so the UI can populate its selector dynamically.
- The chat route supports two prompt modes: `legacy-toaster` for a lighter baseline and `shoedelussy` for stricter JSON/schema adherence and safer Strudel-only edits.
- The chat route can also append a user-authored custom system prompt override on top of the selected base prompt.
- The embedded Strudel reference that feeds the chat prompt is checked into `src/lib/strudel-docs/` and combined by `src/lib/strudel-docs/index.ts`.
- `src/lib/strudel-docs/10-full-song-examples.ts` is currently a placeholder and is intentionally not imported into the combined `STRUDEL_DOCS` export.
- Only the last 20 non-system chat messages are forwarded to the LLM on each request.
- The shared AI contract helper now parses balanced JSON more defensively, rejects unsupported methods and one-argument `.sometimesBy()` usage, removes stray `await`, replaces unsupported sound names like `chirp`, remaps invalid bank+voice combos to safe fallbacks, auto-repairs known broken rare-event sample patterns into explicit `~`-based mini-notation, rejects unsupported banks, rejects oversized generated code, and prevents false-positive `has_code_change` responses when the code is unchanged.
- `POST /api/generate` now shares the same Strudel validator, unwraps accidental JSON envelopes or markdown fences, rejects unchanged fix attempts, and uses the configured default model instead of a deprecated hardcoded preview model.
- The chat SSE route emits keepalive comments so long-running generations are less likely to stall behind intermediate proxies.
- Firebase auth and Supabase are still planned follow-up work from the full spec.
- For live-hosting disclosure, the public source and license notice are documented in `../docs/STRUDEL_SOURCE_DISCLOSURE.md` and linked from the UI.

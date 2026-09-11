# Shoedelussy MCP Integration Spec

> **Status:** Draft — April 2026
> **Scope:** Adds a Model Context Protocol (MCP) server endpoint to the existing Cloudflare Workers / Hono backend so that any MCP-capable agent (Claude Desktop, Cursor, custom agents, etc.) can drive the Shoedelussy editor over a standard protocol — no browser automation required.

---

## 1. Why MCP in Shoedelussy

The existing `POST /api/chat` flow is tightly coupled to the Shoedelussy web UI.  
MCP decouples AI control from the browser session, enabling:

- **External agents** (Claude Desktop, Cursor, custom scripts) to generate/inject Strudel code without opening the web app
- **Tool-use patterns** — agents can call atomic operations (`write_pattern`, `set_bpm`, `inject_section`) instead of talking through a free-form chat prompt
- **Composability** — Shoedelussy tools can be mixed with other MCP servers in a single agent workflow
- **Real-time remote control** — the Shoedelussy runtime at `strudel.ussyco.de` becomes a proper AI instrument endpoint; `shoe.ussyco.de` can point at the same service as an alias

The prior art confirms demand: the `williamzujkowski/strudel-mcp-server` project (40+ tools, Playwright-based) and the `strudel-mcp` npm package both took the approach of bolting a separate MCP process onto Strudel.cc via browser automation.  
Shoedelussy can do this natively — no browser required — because the pattern state already lives in the server KV and SSE stream.

---

## 2. Architecture Overview

```
MCP Client (Claude Desktop / Cursor / custom agent)
        │
        │  HTTP POST  (Streamable HTTP transport, MCP 2025-11)
        ▼
┌──────────────────────────────────────┐
│  Cloudflare Worker  (Hono)           │
│                                      │
│  app.all('/mcp', mcpHandler)  ◄──────┤  new route
│                                      │
│  McpServer (SDK 1.x)                 │
│  ├── tools: write_pattern            │
│  ├── tools: get_pattern              │
│  ├── tools: set_bpm                  │
│  ├── tools: set_key                  │
│  ├── tools: list_projects            │
│  ├── tools: load_project             │
│  ├── tools: save_snapshot            │
│  ├── tools: mutate_pattern           │
│  └── resources: projects/*, docs/*  │
│                                      │
│  Existing routes untouched:          │
│  /api/chat  /api/generate            │
│  /api/projects  /api/share           │
└──────────────────────────────────────┘
        │  KV reads/writes (PROJECTS_KV)
        │  SSE broadcast (optional phase 2)
        ▼
   Shoedelussy UI at strudel.ussyco.de
   (polls or subscribes for live pattern updates)
```

### Transport choice

Use **Streamable HTTP** (the 2025-11 MCP spec default) via `@hono/mcp`.  
This is a single `app.all('/mcp', ...)` handler — no WebSocket, no separate process.  
Cloudflare Workers support streaming responses natively so this maps cleanly.

---

## 3. Dependencies

| Package | Purpose | Where |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP server primitives (`McpServer`, tool/resource registration) | `server/` |
| `@hono/mcp` | Hono adapter — exposes `createMcpHandler(server)` | `server/` |
| `zod` | Already present — tool input schemas | `server/` (existing) |

Add to `server/package.json`:

```jsonc
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.12.0",
  "@hono/mcp": "^0.1.0"
}
```

No new UI dependencies. The MCP endpoint is server-only.

---

## 4. File Layout

```
server/src/
├── index.ts                    ← add: app.all('/mcp', mcpHandler)
├── routes/
│   ├── chat.ts                 (untouched)
│   ├── generate.ts             (untouched)
│   ├── projects.ts             (untouched)
│   ├── share.ts                (untouched)
│   └── mcp.ts                  ← NEW: McpServer construction + tool defs
└── lib/
    └── mcp-tools/
        ├── pattern-tools.ts    ← NEW: write/get/mutate pattern tools
        ├── project-tools.ts    ← NEW: list/load/save project tools
        ├── transport-tools.ts  ← NEW: set_bpm, set_key, get_state
        └── resources.ts        ← NEW: MCP resource handlers
```

Keeping tool groups in `lib/mcp-tools/` mirrors the existing `lib/strudel-docs/` convention and makes the file graph easy to follow.

---

## 5. MCP Server Bootstrap (`server/src/routes/mcp.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler } from '@hono/mcp'
import { registerPatternTools } from '../lib/mcp-tools/pattern-tools'
import { registerProjectTools } from '../lib/mcp-tools/project-tools'
import { registerTransportTools } from '../lib/mcp-tools/transport-tools'
import { registerResources } from '../lib/mcp-tools/resources'
import type { Env } from '../index'

export function buildMcpHandler(env: Env) {
  const server = new McpServer({
    name: 'shoedelussy',
    version: '0.1.0',
  })

  registerPatternTools(server, env)
  registerProjectTools(server, env)
  registerTransportTools(server, env)
  registerResources(server, env)

  return createMcpHandler(server)
}
```

In `index.ts`, mount it:

```typescript
import { buildMcpHandler } from './routes/mcp'

// after existing routes:
app.all('/mcp', async (c) => {
  const handler = buildMcpHandler(c.env)
  return handler(c.req.raw, c.env, c.executionCtx)
})
```

---

## 6. Tool Catalogue

All tools use **Zod schemas** for input validation, consistent with the existing codebase pattern.  
Every tool returns `{ content: [{ type: 'text', text: string }] }` — the standard MCP content shape.

### 6.1 Pattern Tools (`pattern-tools.ts`)

#### `write_pattern`
Overwrite the active pattern for a project (or a scratch key in KV).

```typescript
server.tool(
  'write_pattern',
  'Write Strudel code to the active project editor. Replaces the full pattern.',
  {
    code: z.string().describe('Valid Strudel mini-notation code'),
    project_id: z.string().optional().describe('Project ID; defaults to scratch'),
  },
  async ({ code, project_id }) => {
    // validate code is non-empty, under 8192 chars
    // write to PROJECTS_KV: `mcp:pattern:${project_id ?? 'scratch'}`
    // return success + sanitized code
  }
)
```

#### `get_pattern`
Read the current pattern for a project.

```typescript
server.tool(
  'get_pattern',
  'Get the current Strudel code for a project.',
  { project_id: z.string().optional() },
  async ({ project_id }) => {
    // read from PROJECTS_KV
  }
)
```

#### `mutate_pattern`
Apply a named mutation to the live pattern.

```typescript
server.tool(
  'mutate_pattern',
  'Apply a mutation to the current pattern: reverse, scramble, double, half, humanize.',
  {
    mutation: z.enum(['reverse', 'scramble', 'double_speed', 'half_speed', 'humanize']),
    project_id: z.string().optional(),
  },
  async ({ mutation, project_id }) => {
    // read current pattern, apply transformation, write back
  }
)
```

#### `inject_section`
Append or replace a named `// [section]` block in the current code.

```typescript
server.tool(
  'inject_section',
  'Insert or replace a named section comment block in the current code.',
  {
    section_name: z.string(),
    code: z.string(),
    mode: z.enum(['append', 'replace']).default('replace'),
    project_id: z.string().optional(),
  },
  async ({ section_name, code, mode, project_id }) => { ... }
)
```

---

### 6.2 Transport Tools (`transport-tools.ts`)

#### `set_bpm`
```typescript
server.tool(
  'set_bpm',
  'Set the BPM for a project.',
  {
    bpm: z.number().int().min(20).max(300),
    project_id: z.string().optional(),
  },
  async ({ bpm, project_id }) => {
    // write `setcpm(${bpm/2})` prepend or replace in pattern
    // also update PROJECTS_KV metadata
  }
)
```

#### `set_key`
```typescript
server.tool(
  'set_key',
  'Set the musical key/scale context for AI generation hints.',
  {
    key: z.string().describe('e.g. "C minor", "F# major"'),
    project_id: z.string().optional(),
  },
  async ({ key, project_id }) => {
    // store as metadata in project KV record
  }
)
```

#### `get_state`
```typescript
server.tool(
  'get_state',
  'Get a summary of the current project state: pattern, BPM, key, section count.',
  { project_id: z.string().optional() },
  async ({ project_id }) => {
    // read KV, parse BPM from setcpm(), count sections
  }
)
```

---

### 6.3 Project Tools (`project-tools.ts`)

#### `list_projects`
```typescript
server.tool(
  'list_projects',
  'List all saved projects with their IDs, names, and last-modified timestamps.',
  {},
  async () => {
    // list from PROJECTS_KV with prefix `project:`
    // return JSON summary
  }
)
```

#### `load_project`
```typescript
server.tool(
  'load_project',
  'Load a project by ID and return its code and metadata.',
  { project_id: z.string() },
  async ({ project_id }) => { ... }
)
```

#### `save_snapshot`
```typescript
server.tool(
  'save_snapshot',
  'Save a named snapshot of the current pattern to the version history.',
  {
    project_id: z.string(),
    label: z.string().optional().describe('Human label for this snapshot'),
  },
  async ({ project_id, label }) => {
    // write to `versions:${project_id}:${Date.now()}` in KV
  }
)
```

---

### 6.4 Resources (`resources.ts`)

MCP Resources are read-only data the agent can subscribe to or dereference.

```typescript
// List resource: all projects
server.resource(
  'projects',
  'projects://list',
  async () => ({
    contents: [{ uri: 'projects://list', mimeType: 'application/json', text: JSON.stringify(projectList) }]
  })
)

// Individual project resource
server.resource(
  'project',
  new ResourceTemplate('projects://{id}', { list: undefined }),
  async (uri, { id }) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(project) }]
  })
)

// Strudel docs as a resource (surfaces the existing strudel-docs/ content)
server.resource(
  'strudel-docs',
  'docs://strudel',
  async () => ({
    contents: [{ uri: 'docs://strudel', mimeType: 'text/plain', text: STRUDEL_DOCS }]
  })
)
```

Exposing `strudel-docs` as a resource lets external agents get the same domain knowledge the chat system uses, without re-implementing it.

---

## 7. Auth & Security

The MCP endpoint at `/mcp` must be protected. Two layers:

### 7.1 Bearer Token

Add an `MCP_SECRET` binding to `wrangler.toml`:

```toml
[vars]
MCP_SECRET = ""   # set in dashboard / .dev.vars
```

In the `/mcp` route, check the `Authorization: Bearer <token>` header before invoking the handler:

```typescript
app.all('/mcp', async (c) => {
  const secret = c.env.MCP_SECRET
  if (secret) {
    const auth = c.req.header('authorization') ?? ''
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== secret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
  const handler = buildMcpHandler(c.env)
  return handler(c.req.raw, c.env, c.executionCtx)
})
```

In development (`MCP_SECRET` unset) the check is skipped so local testing works out of the box.

### 7.2 KV Write Scoping

All MCP KV writes use the `mcp:` prefix namespace, separate from the UI's `project:` and `share:` namespaces. This prevents MCP tools from clobbering UI-managed data unless the tool explicitly opts in.

### 7.3 Code Input Sanitisation

`write_pattern` and `inject_section` must apply the same sanitisation that `POST /api/generate` already enforces:
- Reject unsupported methods (`.bend()`, `.stutter()`, etc.)
- Reject patterns over 8192 chars
- Remap invalid drum bank/voice combos

Reuse the existing validation helpers from `lib/` — do not duplicate them.

---

## 8. Environment / Config Changes

### `server/.dev.vars.example` additions
```
MCP_SECRET=local-dev-secret
```

### `server/wrangler.toml.example` additions
```toml
[vars]
MCP_SECRET = ""
```

### CORS
The existing CORS middleware already allows all origins in development.  
In production, the `/mcp` route does not serve browser requests — it serves agent HTTP clients — so CORS is not relevant. No changes needed.

---

## 9. UI Integration (Phase 2, Optional)

Once the MCP endpoint is live, the UI can show a lightweight **MCP status indicator** in the topbar:

- A small `MCP` badge (similar to the existing token usage pill) that pulses green when an MCP client has written to the active project's KV slot in the last 5 seconds
- The badge taps into a `GET /api/mcp/status?project_id=...` polling endpoint (lightweight, returns `{ active: bool, lastWrite: number }`)
- When `active`, the transport bar shows "Remote" instead of nothing in the play state area

This is non-blocking — the MCP server works fully without UI changes.

---

## 10. Client Configuration Examples

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "shoedelussy": {
      "url": "https://strudel.ussyco.de/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_SECRET"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "shoedelussy": {
      "url": "https://strudel.ussyco.de/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_SECRET" }
    }
  }
}
```

### Local dev (stdio transport alternative)
For local development without deploying, a thin `server/src/mcp-stdio.ts` wrapper can expose the same tool set over stdio:

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildMcpServer } from './routes/mcp-server'

const server = buildMcpServer(localEnv)
const transport = new StdioServerTransport()
await server.connect(transport)
```

Add a `package.json` script: `"mcp:stdio": "tsx src/mcp-stdio.ts"`.

---

## 11. Testing Plan

### Unit tests (`server/src/lib/mcp-tools/*.test.ts`)
- `write_pattern` rejects oversized code
- `write_pattern` rejects unsupported methods
- `mutate_pattern` reverse/double/half produce expected output on a fixed seed pattern
- `set_bpm` prepends `setcpm()` correctly
- `get_state` parses BPM and section count from known fixture

### Integration test (`server/src/routes/mcp.test.ts`)
- POST `/mcp` without auth returns 401
- POST `/mcp` with correct bearer + `tools/list` call returns all registered tools
- POST `/mcp` with `write_pattern` call writes to KV and returns success
- `list_projects` returns the correct project list from a mocked KV

Use Cloudflare's `vitest` + `@cloudflare/vitest-pool-workers` setup already present in the project.

---

## 12. Implementation Order

1. **Install deps** — add `@modelcontextprotocol/sdk` + `@hono/mcp` to `server/package.json`, run `pnpm install`
2. **Build `lib/mcp-tools/`** — implement all four tool files with Zod schemas and KV logic
3. **Build `routes/mcp.ts`** — wire `McpServer` + tool registrations + `createMcpHandler`
4. **Mount in `index.ts`** — add auth guard + `app.all('/mcp', ...)` after existing routes
5. **Update `.dev.vars.example`** and `wrangler.toml.example`
6. **Write tests** — unit tests for each tool group, one integration test for the endpoint
7. **Test locally** — `pnpm dev` in `server/`, then use `npx @modelcontextprotocol/inspector` to call `/mcp`
8. **Deploy** — `pnpm exec wrangler deploy`, set `MCP_SECRET` in CF dashboard
9. **Wire Claude Desktop** — add config entry, test `list_projects` + `write_pattern` from Claude
10. **Phase 2 (optional)** — add UI MCP status badge

---

## 13. Out of Scope (This Spec)

- Browser automation / Playwright (that is the `strudel-mcp-server` approach — we are server-native)
- MCP Sampling (server-to-LLM calls) — future spec
- OAuth / multi-user MCP auth — deferred pending Firebase auth
- WebSocket / SSE MCP transport — Streamable HTTP covers the use case
- Live audio analysis over MCP — requires browser Web Audio API, not available server-side

---

## References

- [MCP Specification 2025-11](https://modelcontextprotocol.io/specification/2025-06-18)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [@hono/mcp — Cloudflare + Hono MCP adapter](https://zenn.dev/collabostyle/articles/0db6a34e549fd6)
- [williamzujkowski/strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server) — prior art (browser-based)
- [strudel-mcp npm package](https://www.npmjs.com/package/strudel-mcp) — prior art (inject-bridge approach)
- [Shoedelussy README](https://github.com/mojomast/shoedelussy/blob/main/README.md)
- [Shoedelussy DAW Spec](docs/SPEC_TOASTER_DAW.md)

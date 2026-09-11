# Shoedelussy MCP Guide

`shoedelussy` exposes a server-native Model Context Protocol endpoint at `/mcp` so MCP-capable clients can inspect and modify Shoedelussy projects without browser automation.

This document describes the current implementation in `server/`, how to configure it, what tools and resources are available, and the main operational constraints.

## Overview

- Endpoint: `/mcp`
- Transport: Streamable HTTP via `@hono/mcp`
- Runtime: Cloudflare Workers + Hono
- Server bootstrap: `server/src/routes/mcp.ts`
- Route mount: `server/src/index.ts`
- Tool modules: `server/src/lib/mcp-tools/`
- Resources: `projects://list`, `projects://{id}`, `docs://strudel`

This MCP endpoint is server-native. It does not rely on Playwright, browser tabs, or DOM injection.

## Current Architecture

Request flow:

1. An MCP client sends an HTTP request to `/mcp`.
2. `server/src/index.ts` applies optional bearer auth using `MCP_SECRET`.
3. `server/src/routes/mcp.ts` builds a fresh `McpServer` and connects it to `StreamableHTTPTransport`.
4. The tool or resource handler reads or writes Cloudflare KV through existing Shoedelussy server helpers.
5. The MCP client receives a standard MCP response.

Key implementation detail:

- Existing API routes remain mounted independently under `/api/*`.
- `/mcp` is mounted after the existing routes and does not replace or intercept them.
- Pattern scratch writes use the `mcp:` namespace.
- Saved project lookups reuse the existing project persistence model in `projectStore.ts`.

## Dependencies

Server dependencies used by MCP:

- `@modelcontextprotocol/sdk`
- `@hono/mcp`
- `zod`

Installed versions currently resolve to:

- `@modelcontextprotocol/sdk` `^1.29.0`
- `@hono/mcp` `^0.1.5`
- `zod` `^3.25.76`

Compatibility note:

- The current `@hono/mcp` package in this repo uses `StreamableHTTPTransport`.
- The earlier spec referenced `createMcpHandler`, but that is not what the installed version exports.

## Configuration

### Local Development

`server/.dev.vars.example` includes:

```bash
MCP_SECRET=local-dev-secret
```

Minimal local setup:

```bash
cd server
cp .dev.vars.example .dev.vars
pnpm dev
```

If `MCP_SECRET` is unset, the `/mcp` auth check is skipped for local convenience.

### Wrangler Example

`server/wrangler.toml.example` includes:

```toml
[vars]
MCP_SECRET = ""
```

In deployed environments, set a real secret instead of leaving it blank.

## Authentication

`/mcp` supports bearer-token protection via `MCP_SECRET`.

Expected header:

```http
Authorization: Bearer YOUR_MCP_SECRET
```

Behavior:

- If `MCP_SECRET` is set and the header is missing or wrong, `/mcp` returns `401`.
- If `MCP_SECRET` is unset, auth is skipped.

Current auth test coverage includes the unauthenticated `401` case in `server/src/routes/mcp.test.ts`.

## Tooling Model

All MCP tools are registered in:

- `server/src/lib/mcp-tools/pattern-tools.ts`
- `server/src/lib/mcp-tools/transport-tools.ts`
- `server/src/lib/mcp-tools/project-tools.ts`

Shared helpers live in:

- `server/src/lib/mcp-tools/shared.ts`

Common guarantees:

- Tool inputs are validated with Zod schemas.
- Tool responses use the MCP text content shape: `{ content: [{ type: 'text', text: string }] }`.
- Error responses also use text content, with MCP `isError` set where appropriate.
- Pattern input sanitization reuses the existing `sanitizeStrudelCode` contract from `server/src/lib/aiContract.ts`.

## Tool Reference

### Pattern Tools

#### `write_pattern`

Purpose:

- Replace the current MCP pattern buffer for a project or scratch slot.

Inputs:

- `code: string`
- `project_id?: string`

Behavior:

- Sanitizes the incoming Strudel code.
- Rejects blocked or oversized code.
- Writes to `PROJECTS_KV` under `mcp:pattern:${project_id || 'scratch'}`.

Response payload text contains JSON with:

- `success`
- `project_id`
- `code`

#### `get_pattern`

Purpose:

- Read the current MCP pattern buffer.

Inputs:

- `project_id?: string`

Behavior:

- Reads the `mcp:pattern:*` KV record.
- Falls back to an empty code string if no record exists.

Response payload text contains JSON with:

- `project_id`
- `code`

#### `mutate_pattern`

Purpose:

- Apply a simple transformation to the current MCP pattern buffer.

Inputs:

- `mutation: 'reverse' | 'scramble' | 'double_speed' | 'half_speed' | 'humanize'`
- `project_id?: string`

Behavior:

- Reads the current MCP pattern.
- Returns an MCP error if no current pattern exists.
- Applies one of the built-in transforms.
- Saves the result back to the same `mcp:pattern:*` KV slot.

Current transforms:

- `reverse`: reverses each line character-by-character
- `scramble`: reverses token order per line
- `double_speed`: appends `.fast(2)` if not already present
- `half_speed`: appends `.slow(2)` if not already present
- `humanize`: appends `.swing(0.03)` if not already present

#### `inject_section`

Purpose:

- Insert or replace a named `// [section]` block within the MCP pattern buffer.

Inputs:

- `section_name: string`
- `code: string`
- `mode: 'append' | 'replace'`
- `project_id?: string`

Behavior:

- Sanitizes the new section code.
- In `append` mode, appends a fresh section block.
- In `replace` mode, replaces the matching section or appends it if missing.

### Transport Tools

#### `set_bpm`

Purpose:

- Update the BPM metadata and ensure the project code contains a matching `setcpm(...)` call.

Inputs:

- `bpm: integer` between `20` and `300`
- `project_id?: string`

Behavior:

- Requires `project_id`.
- Loads a saved project through the MCP project mapping key.
- Replaces an existing `setcpm(...)` or prepends one.
- Updates both `project.bpm` and `project.strudel_code`.

Important scope note:

- `set_bpm` operates on saved project records, not the separate scratch `mcp:pattern:*` buffer.

#### `set_key`

Purpose:

- Update the saved project's key metadata.

Inputs:

- `key: string`
- `project_id?: string`

Behavior:

- Requires `project_id`.
- Loads the saved project and writes back the updated `key` field.

#### `get_state`

Purpose:

- Return a quick project summary for agents.

Inputs:

- `project_id?: string`

Behavior:

- Requires `project_id`.
- Reads the saved project.
- Returns the current code, derived or stored BPM, key, and section count.

Response payload text contains JSON with:

- `project_id`
- `bpm`
- `key`
- `sectionCount`
- `code`

### Project Tools

#### `list_projects`

Purpose:

- List saved projects across indexed users.

Behavior:

- Reads KV keys with prefix `projects:`.
- Expands them into project lists via `projectStore.ts`.
- Sorts by descending `updated_at`.

Response payload text contains a JSON array of project summaries.

#### `load_project`

Purpose:

- Load a saved project record by project id.

Inputs:

- `project_id: string`

Behavior:

- Uses the MCP project-id mapping key to locate the owning user.
- Returns the full saved `ProjectRecord` as JSON text.

#### `save_snapshot`

Purpose:

- Create a new version entry from the current saved project code.

Inputs:

- `project_id: string`
- `label?: string`

Behavior:

- Loads the saved project.
- Creates a new version object with `created_by: 'ai'`.
- Prepends the version to `project.versions`.
- Saves the updated project back through the normal project store.

## Resource Reference

Resources are registered in `server/src/lib/mcp-tools/resources.ts`.

### `projects://list`

- Returns all indexed saved projects as JSON.

### `projects://{id}`

- Returns one saved project as JSON.
- If the project is not found, the resource body currently serializes `null`.

### `docs://strudel`

- Returns the checked-in Strudel reference text used by the server.

This is useful for agents that want Shoedelussy-adjacent reference material without scraping the repo or prompting through `/api/chat`.

## KV Layout

Current MCP-related KV keys:

- `mcp:pattern:${projectId}`
- `mcp-project:${projectId}`

What each key does:

- `mcp:pattern:*` stores the MCP scratch/live pattern record.
- `mcp-project:*` maps a project id to its owning `user_id` so MCP tools can find the saved project record.

Saved projects themselves still live in the normal project namespaces managed by `projectStore.ts`, including keys like:

- `project:${userId}:${projectId}`
- `projects:${userId}`

Important distinction:

- Pattern scratch buffers are explicitly under the `mcp:` namespace.
- Saved project mutations still pass through the existing project storage helpers.

## Sanitization And Safety

Pattern-writing tools reuse the existing sanitization path from `server/src/lib/aiContract.ts`.

That means MCP pattern writes inherit the same defensive behavior as AI-generated code handling, including rejection of unsupported methods and guardrails around unsafe or invalid input.

Current explicit checks in `sanitizePatternInput`:

- empty code is rejected
- code over `8192` characters is rejected
- code over the broader `MAX_CODE_LENGTH` limit is rejected
- `sanitizeStrudelCode(...)` blocking issues are surfaced directly

## Behavioral Notes And Limitations

Current implementation details worth knowing:

- `write_pattern`, `get_pattern`, `mutate_pattern`, and `inject_section` operate on the MCP scratch buffer, not directly on saved projects.
- `set_bpm`, `set_key`, `get_state`, `load_project`, and `save_snapshot` operate on saved projects.
- MCP project lookups depend on the `mcp-project:${projectId}` mapping key being present.
- That mapping is created when MCP saves a project through `saveProjectForMcp(...)`.

Practical consequence:

- A project created purely through the UI may not be addressable by MCP saved-project tools until it has been indexed through the MCP mapping path.

Also note:

- The original spec mentioned possible SSE/UI integration as a future phase. That is not implemented here.
- No browser automation, sampling, OAuth, or live audio-analysis features are part of this endpoint.

## Example Client Config

### Claude Desktop

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

### Cursor

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

## Verification

Relevant current tests:

- `server/src/lib/mcp-tools/pattern-tools.test.ts`
- `server/src/lib/mcp-tools/transport-tools.test.ts`
- `server/src/lib/mcp-tools/project-tools.test.ts`
- `server/src/routes/mcp.test.ts`

Run them with:

```bash
cd server
pnpm test --run src/lib/mcp-tools/pattern-tools.test.ts src/lib/mcp-tools/transport-tools.test.ts src/lib/mcp-tools/project-tools.test.ts src/routes/mcp.test.ts
```

TypeScript note:

- A dedicated `server/tsconfig.mcp.json` exists to isolate MCP-related typechecking from the full server compile graph.
- In this workspace, full-project `tsc` has been memory-heavy after adding MCP dependencies.

## File Map

- `docs/MCP.md`: implementation guide
- `docs/SPEC_MCP.md`: original implementation spec
- `server/src/routes/mcp.ts`: MCP server bootstrap and transport handling
- `server/src/index.ts`: route mount and auth guard
- `server/src/lib/mcp-tools/shared.ts`: shared helpers and KV helpers
- `server/src/lib/mcp-tools/pattern-tools.ts`: pattern tools
- `server/src/lib/mcp-tools/transport-tools.ts`: transport/state tools
- `server/src/lib/mcp-tools/project-tools.ts`: project tools
- `server/src/lib/mcp-tools/resources.ts`: MCP resources
- `server/src/routes/mcp.test.ts`: endpoint auth test

## Status

Implementation status today:

- MCP route is implemented
- MCP auth guard is implemented
- pattern, transport, project tools are implemented
- resources are implemented
- focused MCP tests are present and currently passing

The original spec remains useful as the design record, but `docs/MCP.md` should be treated as the current implementation guide.

import { MAX_CODE_LENGTH, sanitizeStrudelCode } from '../aiContract'
import type { Env } from '../../index'
import { getProjectRecord, listProjectRecords, saveProjectRecord, type CodeVersion, type ProjectRecord } from '../projectStore'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'

export interface MinimalMcpToolServer {
  registerTool: <OutputArgs extends ZodRawShapeCompat | AnySchema, InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
    name: string,
    config: {
      title?: string
      description?: string
      inputSchema?: InputArgs
      outputSchema?: OutputArgs
      annotations?: Record<string, unknown>
      _meta?: Record<string, unknown>
    },
    cb: (args: any) => CallToolResult | Promise<CallToolResult>,
  ) => unknown
}

export interface MinimalMcpResourceServer {
  registerResource: {
    (name: string, uriOrTemplate: string, config: Record<string, never>, cb: (...args: any[]) => ReadResourceResult | Promise<ReadResourceResult>): unknown
    (name: string, uriOrTemplate: { uriTemplate: unknown }, config: Record<string, never>, cb: (...args: any[]) => ReadResourceResult | Promise<ReadResourceResult>): unknown
  }
}

export interface McpPatternRecord {
  project_id: string
  code: string
  updated_at: string
}

const MCP_PATTERN_KEY_PREFIX = 'mcp:pattern:'
const MCP_PROJECT_ID_PREFIX = 'mcp-project:'

export const mcpText = (text: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text }],
  ...(isError ? { isError: true } : {}),
})

export const mcpResource = (uri: string, mimeType: string, text: string): ReadResourceResult => ({
  contents: [{ uri, mimeType, text }],
})

export const getScratchProjectId = (projectId?: string) => projectId?.trim() || 'scratch'

export const getMcpPatternKey = (projectId?: string) => `${MCP_PATTERN_KEY_PREFIX}${getScratchProjectId(projectId)}`

export const getMcpProjectId = (projectId: string) => `${MCP_PROJECT_ID_PREFIX}${projectId}`

export const sanitizePatternInput = (input: string): { code: string } | { error: string } => {
  const sanitized = sanitizeStrudelCode(input)
  if (sanitized.blockingIssue) {
    return { error: sanitized.blockingIssue }
  }

  const code = sanitized.code.trim()
  if (!code) {
    return { error: 'Strudel code must not be empty.' }
  }

  if (code.length > 8192 || code.length > MAX_CODE_LENGTH) {
    return { error: 'Strudel code exceeds the 8192 character MCP safety limit.' }
  }

  return { code }
}

export const loadMcpPatternRecord = async (env: Env, projectId?: string): Promise<McpPatternRecord | null> => {
  const raw = await env.PROJECTS_KV.get(getMcpPatternKey(projectId))
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as McpPatternRecord
  } catch {
    return null
  }
}

export const saveMcpPatternRecord = async (env: Env, projectId: string | undefined, code: string): Promise<McpPatternRecord> => {
  const record: McpPatternRecord = {
    project_id: getScratchProjectId(projectId),
    code,
    updated_at: new Date().toISOString(),
  }

  await env.PROJECTS_KV.put(getMcpPatternKey(projectId), JSON.stringify(record))
  return record
}

export const findProjectAcrossUsers = async (env: Env, projectId: string): Promise<ProjectRecord | null> => {
  const mappedUserId = await env.PROJECTS_KV.get(getMcpProjectId(projectId))
  if (mappedUserId) {
    return getProjectRecord(env, mappedUserId, projectId)
  }

  const projects = await listAllProjectsForMcp(env)
  return projects.find((project) => project.id === projectId) ?? null
}

export const saveProjectForMcp = async (env: Env, project: ProjectRecord): Promise<ProjectRecord> => {
  const saved = await saveProjectRecord(env, project)
  await env.PROJECTS_KV.put(getMcpProjectId(project.id), project.user_id)
  return saved
}

export const listAllProjectsForMcp = async (env: Env): Promise<ProjectRecord[]> => {
  const keys = await env.PROJECTS_KV.list({ prefix: 'projects:' })
  const userIds = keys.keys.map(({ name }) => name.slice('projects:'.length)).filter(Boolean)
  const nestedProjects = await Promise.all(userIds.map((userId) => listProjectRecords(env, userId)))
  return nestedProjects.flat().sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export const saveSnapshotVersion = async (project: ProjectRecord, label?: string): Promise<CodeVersion> => ({
  id: crypto.randomUUID(),
  code: project.strudel_code,
  label,
  created_at: new Date().toISOString(),
  created_by: 'ai',
})

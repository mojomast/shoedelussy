import type { Env } from '../index'

export interface CodeDiff {
  before: string
  after: string
  summary: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  code_diff?: CodeDiff
  status?: 'pending' | 'applied' | 'rejected'
  timestamp: string
}

export interface LightingSectionBinding {
  section_label: string
  scene_id: string
}

export interface LightingTrackBinding {
  track_name: string
  group_id: string
  intensity?: number
  hold_ms?: number
  fade_ms?: number
}

export interface LightingProjectState {
  cue_bindings: LightingSectionBinding[]
  group_bindings: LightingTrackBinding[]
}

export interface CodeVersion {
  id: string
  code: string
  label?: string
  created_at: string
  created_by: 'user' | 'ai'
}

export interface ProjectRecord {
  id: string
  user_id: string
  name: string
  description?: string
  strudel_code: string
  chat_history: ChatMessage[]
  versions: CodeVersion[]
  lighting?: LightingProjectState
  bpm?: number
  key?: string
  tags: string[]
  is_public?: boolean
  created_at: string
  updated_at: string
}

const projectKey = (userId: string, projectId: string) => `project:${userId}:${projectId}`
const projectIndexKey = (userId: string) => `projects:${userId}`
const mcpProjectKey = (projectId: string) => `mcp-project:${projectId}`

const readIndex = async (env: Env, userId: string): Promise<string[]> => {
  const raw = await env.PROJECTS_KV.get(projectIndexKey(userId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

const writeIndex = async (env: Env, userId: string, projectIds: string[]) => {
  await env.PROJECTS_KV.put(projectIndexKey(userId), JSON.stringify(projectIds))
}

export const saveProjectRecord = async (env: Env, project: ProjectRecord): Promise<ProjectRecord> => {
  await env.PROJECTS_KV.put(projectKey(project.user_id, project.id), JSON.stringify(project))
  await env.PROJECTS_KV.put(mcpProjectKey(project.id), project.user_id)
  const currentIndex = await readIndex(env, project.user_id)
  if (!currentIndex.includes(project.id)) {
    await writeIndex(env, project.user_id, [...currentIndex, project.id])
  }
  return project
}

export const getProjectRecord = async (env: Env, userId: string, projectId: string): Promise<ProjectRecord | null> => {
  const raw = await env.PROJECTS_KV.get(projectKey(userId, projectId))
  if (!raw) return null

  try {
    return JSON.parse(raw) as ProjectRecord
  } catch {
    return null
  }
}

export const listProjectRecords = async (env: Env, userId: string): Promise<ProjectRecord[]> => {
  const ids = await readIndex(env, userId)
  const projects = await Promise.all(ids.map((id) => getProjectRecord(env, userId, id)))
  return projects
    .filter((project): project is ProjectRecord => project !== null)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export const deleteProjectRecord = async (env: Env, userId: string, projectId: string): Promise<boolean> => {
  const project = await getProjectRecord(env, userId, projectId)
  if (!project) return false

  await env.PROJECTS_KV.delete(projectKey(userId, projectId))
  await env.PROJECTS_KV.delete(mcpProjectKey(projectId))
  const ids = await readIndex(env, userId)
  await writeIndex(env, userId, ids.filter((id) => id !== projectId))
  return true
}

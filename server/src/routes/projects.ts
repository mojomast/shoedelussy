import { Hono } from 'hono'
import type { Env } from '../index'
import { deleteProjectRecord, getProjectRecord, listProjectRecords, saveProjectRecord, type CodeVersion, type ProjectRecord } from '../lib/projectStore'

export const projectsRoute = new Hono<{ Bindings: Env }>()

const MAX_VERSIONS = 100

const getUserId = (c: Parameters<typeof projectsRoute.get>[1] extends never ? never : any): string | null => {
  const userId = c.req.header('x-user-id')?.trim()
  return userId && userId.length > 0 ? userId : null
}

const readJson = async <T>(c: any): Promise<T | null> => {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

const ensureUserId = (c: Parameters<typeof projectsRoute.get>[1] extends never ? never : any): string | Response => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'Missing x-user-id header' }, 401)
  }
  return userId
}

projectsRoute.get('/', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const projects = await listProjectRecords(c.env, userId)
  return c.json(projects.map((project) => ({
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    key: project.key,
    tags: project.tags,
    updated_at: project.updated_at,
  })))
})

projectsRoute.post('/', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const body = await readJson<Partial<ProjectRecord>>(c)
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const now = new Date().toISOString()
  const project: ProjectRecord = {
    id: body.id || crypto.randomUUID(),
    user_id: userId,
    name: body.name?.trim() || 'Untitled Project',
    description: body.description,
    strudel_code: body.strudel_code || '',
    chat_history: body.chat_history || [],
    versions: body.versions || [],
    lighting: body.lighting,
    bpm: body.bpm,
    key: body.key,
    tags: body.tags || [],
    is_public: body.is_public || false,
    created_at: body.created_at || now,
    updated_at: now,
  }

  await saveProjectRecord(c.env, project)
  return c.json(project, 201)
})

projectsRoute.get('/:id', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const project = await getProjectRecord(c.env, userId, c.req.param('id'))
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(project)
})

projectsRoute.put('/:id', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const projectId = c.req.param('id')
  // Upsert: the UI uses PUT for any project referenced in the URL, including
  // guest projects that have not been persisted to the server yet.
  const existing = await getProjectRecord(c.env, userId, projectId)

  const body = await readJson<Partial<ProjectRecord>>(c)
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const now = new Date().toISOString()

  const project: ProjectRecord = {
    id: projectId,
    user_id: userId,
    name: body.name?.trim() || existing?.name || 'Untitled Project',
    description: body.description ?? existing?.description,
    strudel_code: body.strudel_code ?? existing?.strudel_code ?? '',
    chat_history: body.chat_history ?? existing?.chat_history ?? [],
    versions: body.versions ?? existing?.versions ?? [],
    lighting: body.lighting ?? existing?.lighting,
    bpm: body.bpm ?? existing?.bpm,
    key: body.key ?? existing?.key,
    tags: body.tags ?? existing?.tags ?? [],
    is_public: body.is_public ?? existing?.is_public ?? false,
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  await saveProjectRecord(c.env, project)
  return c.json(project)
})

projectsRoute.delete('/:id', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const deleted = await deleteProjectRecord(c.env, userId, c.req.param('id'))
  if (!deleted) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({ success: true })
})

projectsRoute.get('/:id/versions', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const project = await getProjectRecord(c.env, userId, c.req.param('id'))
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(project.versions)
})

projectsRoute.post('/:id/versions', async (c) => {
  const userId = ensureUserId(c)
  if (typeof userId !== 'string') return userId

  const project = await getProjectRecord(c.env, userId, c.req.param('id'))
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const body = await readJson<Partial<CodeVersion>>(c)
  if (!body) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const version: CodeVersion = {
    id: crypto.randomUUID(),
    code: body.code || project.strudel_code,
    label: body.label,
    created_at: new Date().toISOString(),
    created_by: body.created_by === 'ai' ? 'ai' : 'user',
  }

  const updatedProject: ProjectRecord = {
    ...project,
    versions: [version, ...project.versions].slice(0, MAX_VERSIONS),
    updated_at: new Date().toISOString(),
  }

  await saveProjectRecord(c.env, updatedProject)
  return c.json(updatedProject.versions, 201)
})

import { z } from 'zod'
import type { Env } from '../../index'
import { findProjectAcrossUsers, mcpText, saveProjectForMcp, type MinimalMcpToolServer } from './shared'

const projectIdSchema = z.object({ project_id: z.string().optional() })
const setBpmSchema = z.object({
  bpm: z.number().int().min(20).max(300),
  project_id: z.string().optional(),
})
const setKeySchema = z.object({
  key: z.string().describe('e.g. "C minor", "F# major"'),
  project_id: z.string().optional(),
})

export const parseBpmFromCode = (code: string): number | null => {
  const setcpsMatch = code.match(/setcps\((\d+(?:\.\d+)?)\)/)
  if (setcpsMatch) return Math.round(Number.parseFloat(setcpsMatch[1]) * 240)

  const legacySetcpmMatch = code.match(/setcpm\((\d+(?:\.\d+)?)\)/)
  if (legacySetcpmMatch) return Math.round(Number.parseFloat(legacySetcpmMatch[1]) * 2)

  return null
}

export const countSections = (code: string) => (code.match(/^\/\/ \[[^\]]+\]/gm) ?? []).length

export const upsertSetcps = (code: string, bpm: number) => {
  const setcps = `setcps(${(bpm / 240).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')})`
  if (/setcps\([^)]*\)/.test(code)) {
    return code.replace(/setcps\([^)]*\)/, setcps)
  }

  if (/setcpm\([^)]*\)/.test(code)) {
    return code.replace(/setcpm\([^)]*\)/, setcps)
  }

  return `${setcps}\n${code.trimStart()}`
}

export const registerTransportTools = (server: MinimalMcpToolServer, env: Env) => {
  server.registerTool('set_bpm', {
    description: 'Set the BPM for a project.',
    inputSchema: setBpmSchema,
  },
    async ({ bpm, project_id }) => {
      if (!project_id) {
        return mcpText('set_bpm requires a project_id.', true)
      }

      const project = await findProjectAcrossUsers(env, project_id)
      if (!project) {
        return mcpText('Project not found.', true)
      }

      const updatedProject = {
        ...project,
        strudel_code: upsertSetcps(project.strudel_code, bpm),
        bpm,
        updated_at: new Date().toISOString(),
      }

      await saveProjectForMcp(env, updatedProject)
      return mcpText(JSON.stringify({ success: true, project_id, bpm }))
    })

  server.registerTool('set_key', {
    description: 'Set the musical key/scale context for AI generation hints.',
    inputSchema: setKeySchema,
  },
    async ({ key, project_id }) => {
      if (!project_id) {
        return mcpText('set_key requires a project_id.', true)
      }

      const project = await findProjectAcrossUsers(env, project_id)
      if (!project) {
        return mcpText('Project not found.', true)
      }

      await saveProjectForMcp(env, {
        ...project,
        key,
        updated_at: new Date().toISOString(),
      })

      return mcpText(JSON.stringify({ success: true, project_id, key }))
    })

  server.registerTool('get_state', {
    description: 'Get a summary of the current project state: pattern, BPM, key, section count.',
    inputSchema: projectIdSchema,
  },
    async ({ project_id }) => {
      if (!project_id) {
        return mcpText('get_state requires a project_id.', true)
      }

      const project = await findProjectAcrossUsers(env, project_id)
      if (!project) {
        return mcpText('Project not found.', true)
      }

      return mcpText(JSON.stringify({
        project_id,
        bpm: project.bpm ?? parseBpmFromCode(project.strudel_code),
        key: project.key ?? null,
        sectionCount: countSections(project.strudel_code),
        code: project.strudel_code,
      }))
    })
}

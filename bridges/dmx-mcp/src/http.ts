import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { DmxMcpConfig } from './config'
import { DmxBridgeService } from './service'

const MAX_BODY_BYTES = 64 * 1024

class HttpRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  let body = ''
  let bytes = 0
  req.on('data', (chunk: Buffer | string) => {
    bytes += Buffer.byteLength(chunk)
    if (bytes > MAX_BODY_BYTES) {
      reject(new HttpRequestError(413, 'Request body is too large'))
      req.destroy()
      return
    }
    body += String(chunk)
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

const readJsonBody = async <T>(req: IncomingMessage): Promise<Partial<T>> => {
  const rawBody = await readBody(req)
  if (!rawBody) return {}

  try {
    return JSON.parse(rawBody) as Partial<T>
  } catch {
    throw new HttpRequestError(400, 'Invalid JSON body')
  }
}

const writeJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

const isAuthorized = (req: IncomingMessage) => {
  const token = process.env.DMX_HTTP_TOKEN?.trim()
  if (!token) {
    return true
  }

  const header = req.headers.authorization
  return header === `Bearer ${token}`
}

export const startHttpServer = (service: DmxBridgeService, config: DmxMcpConfig): Promise<Server> => new Promise((resolve, reject) => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${config.host}:${config.port}`)

      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.end()
        return
      }

      if (url.pathname === '/health') {
        writeJson(res, 200, { ok: true, ...service.getConnectionStatus() })
        return
      }

      if (url.pathname === '/state') {
        writeJson(res, 200, await service.getVisualizationState())
        return
      }

      if (req.method === 'POST' && !isAuthorized(req)) {
        writeJson(res, 401, { error: 'Unauthorized' })
        return
      }

      if (url.pathname === '/patch' && req.method === 'GET') {
        writeJson(res, 200, service.getPatch())
        return
      }

      if (url.pathname === '/scenes' && req.method === 'GET') {
        writeJson(res, 200, { scenes: service.listScenes() })
        return
      }

      if (url.pathname === '/scenes/apply' && req.method === 'POST') {
        const payload = await readJsonBody<{ scene_id?: string; idempotency_key?: string }>(req)
        if (!payload.scene_id) {
          writeJson(res, 400, { error: 'scene_id is required' })
          return
        }

        const receipt = await service.applyScene(payload.scene_id, payload.idempotency_key ?? `http-${randomUUID()}`, false)
        writeJson(res, 200, receipt)
        return
      }

      if (url.pathname === '/control/arm' && req.method === 'POST') {
        const payload = await readJsonBody<{ idempotency_key?: string }>(req)
        writeJson(res, 200, await service.arm(payload.idempotency_key ?? `http-arm-${randomUUID()}`, false))
        return
      }

      if (url.pathname === '/control/disarm' && req.method === 'POST') {
        const payload = await readJsonBody<{ idempotency_key?: string }>(req)
        writeJson(res, 200, await service.disarm(payload.idempotency_key ?? `http-disarm-${randomUUID()}`, false))
        return
      }

      if (url.pathname === '/control/blackout' && req.method === 'POST') {
        const payload = await readJsonBody<{ idempotency_key?: string }>(req)
        writeJson(res, 200, await service.blackout(payload.idempotency_key ?? `http-blackout-${randomUUID()}`, false))
        return
      }

      if (url.pathname === '/control/group' && req.method === 'POST') {
        const payload = await readJsonBody<{
              group_id?: string
              intensity?: number
              red?: number
              green?: number
              blue?: number
              white?: number
              idempotency_key?: string
            }>(req)
        if (!payload.group_id) {
          writeJson(res, 400, { error: 'group_id is required' })
          return
        }

        const receipt = await service.setGroupState(
          payload.group_id,
          {
            intensity: payload.intensity,
            red: payload.red,
            green: payload.green,
            blue: payload.blue,
            white: payload.white,
          },
          payload.idempotency_key ?? `http-group-${randomUUID()}`,
          false,
        )
        writeJson(res, 200, receipt)
        return
      }

      writeJson(res, 404, { error: 'Not found' })
    } catch (error) {
      if (error instanceof HttpRequestError) {
        writeJson(res, error.status, { error: error.message })
        return
      }
      writeJson(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' })
    }
  })

  server.once('error', reject)
  server.listen(config.port, config.host, () => resolve(server))
})

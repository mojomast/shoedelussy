import type { AIResponse, ChatMessage, ChatModel, ChatStreamErrorInfo, CodeVersion, Project, ProjectSummary, SystemPromptMode } from '@/types/project'

const API_URL = import.meta.env.VITE_API_URL || ''

type ProjectUpdate = Partial<Project> & Pick<Project, 'id'>

export interface ChatProviderOverride {
  endpoint: string
  apiKey: string
}

export interface ChatPayload {
  project_id?: string
  messages: Pick<ChatMessage, 'role' | 'content'>[]
  current_code: string
  model?: ChatModel
  system_prompt_mode?: SystemPromptMode
  custom_system_prompt?: string
  provider?: ChatProviderOverride
  project_meta: { bpm?: number; key?: string; tags?: string[] }
}

interface ChatStreamHandlers {
  onChunk?: (chunk: string) => void
  onDone?: (response: AIResponse) => void
  onStreamError?: (error: ChatStreamErrorInfo) => void
  signal?: AbortSignal
}

const buildRequestError = async (response: Response): Promise<Error> => {
  const error = await response.json().catch(() => ({})) as Record<string, unknown>
  const message = typeof error['message'] === 'string'
    ? error['message']
    : typeof error['error'] === 'string'
      ? error['error']
      : `Request failed: ${response.status}`

  const requestError = new Error(message) as Error & { status?: number; retryAfter?: number }
  requestError.status = response.status
  if (typeof error['retryAfter'] === 'number') {
    requestError.retryAfter = error['retryAfter']
  }
  return requestError
}

const createChatStreamError = (message: string, status?: number, retryAfter?: number): ChatStreamErrorInfo => ({
  message,
  status,
  retryAfter,
  isRetryable: status === 429 || status === 503 || message.toLowerCase().includes('empty response'),
})

const parseSseEvent = (rawEvent: string): { data: string | null; isDone: boolean } => {
  const normalized = rawEvent.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue
    dataLines.push(line.slice(5).trimStart())
  }

  if (dataLines.length === 0) {
    return { data: null, isDone: false }
  }

  const data = dataLines.join('\n').trim()
  return {
    data,
    isDone: data === '[DONE]',
  }
}

const request = async <T>(path: string, options: RequestInit = {}, userId?: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw await buildRequestError(response)
  }

  return response.json() as Promise<T>
}

export const api = {
  createProject: (project: Partial<Project>, userId: string) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    }, userId),

  listProjects: (userId: string) => request<ProjectSummary[]>('/api/projects', {}, userId),

  getProject: (projectId: string, userId: string) => request<Project>(`/api/projects/${projectId}`, {}, userId),

  updateProject: (project: ProjectUpdate, userId: string) =>
    request<Project>(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }, userId),

  deleteProject: (projectId: string, userId: string) =>
    request<{ success: true }>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }, userId),

  createVersion: (projectId: string, payload: { code: string; label?: string; created_by: 'user' | 'ai' }, userId: string) =>
    request<CodeVersion[]>(`/api/projects/${projectId}/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, userId),

  getVersions: (projectId: string, userId: string) => request<CodeVersion[]>(`/api/projects/${projectId}/versions`, {}, userId),

  getChatModels: (provider: ChatProviderOverride, userId: string) =>
    request<{ models: string[] }>('/api/chat/models', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }, userId),

  chat: (payload: ChatPayload, userId: string) =>
    request<AIResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, userId),

  chatStream: async (payload: ChatPayload, userId: string, handlers: ChatStreamHandlers = {}) => {
    const controller = new AbortController()
    const externalSignal = handlers.signal
    const forwardAbort = () => controller.abort()
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort()
      else externalSignal.addEventListener('abort', forwardAbort)
    }

    // Abort the stream if the server goes quiet for too long.
    const IDLE_TIMEOUT_MS = 60_000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      resetIdleTimer()
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw await buildRequestError(response)
      }

      if (!response.body) {
        throw new Error('Streaming response body unavailable')
      }

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResponse: AIResponse | null = null
      let streamError: ChatStreamErrorInfo | null = null
      let doneMarkerSeen = false

      const processLine = (rawEvent: string): boolean => {
        const parsedEvent = parseSseEvent(rawEvent)
        if (!parsedEvent.data) return false
        if (parsedEvent.isDone) {
          doneMarkerSeen = true
          return true
        }

        let parsed: { type?: string; chunk?: string; response?: AIResponse; error?: string }
        try {
          parsed = JSON.parse(parsedEvent.data) as typeof parsed
        } catch {
          streamError = createChatStreamError('Received a malformed streaming event from the server.')
          return false
        }

        if (parsed.type === 'chunk' && parsed.chunk) {
          handlers.onChunk?.(parsed.chunk)
          return false
        }
        if (parsed.type === 'error' || parsed.type === 'contract_error') {
          streamError = createChatStreamError(parsed.error || 'Streaming chat failed')
          handlers.onStreamError?.(streamError)
          return true
        }
        if (parsed.type === 'done' && parsed.response) {
          finalResponse = parsed.response
          return false
        }
        return false
      }

      let readerDone = false
      while (!readerDone) {
        const { done, value } = await reader.read()
        resetIdleTimer()
        if (done) readerDone = true
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        // Normalize CRLF frame boundaries emitted by some proxies.
        buffer = buffer.replace(/\r\n/g, '\n')

        let boundaryIndex = buffer.indexOf('\n\n')
        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)
          const streamDone = processLine(rawEvent)
          boundaryIndex = buffer.indexOf('\n\n')
          if (streamDone) {
            readerDone = true
            break
          }
        }
      }

      if (buffer.trim()) {
        processLine(buffer)
      }

      if (streamError) {
        throw new Error((streamError as ChatStreamErrorInfo).message)
      }

      if (!finalResponse) {
        const message = doneMarkerSeen
          ? 'Streaming chat ended without a final structured response'
          : 'Streaming chat ended before final response was received'
        const error = createChatStreamError(message)
        handlers.onStreamError?.(error)
        throw new Error(error.message)
      }

      handlers.onDone?.(finalResponse)
      return finalResponse
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
      if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
      void reader?.cancel().catch(() => undefined)
    }
  },

  shareCode: (code: string, title?: string) =>
    request<{ id: string; url: string }>('/api/share', {
      method: 'POST',
      body: JSON.stringify({ code, title }),
    }),

  loadSharedCode: (shareId: string) => request<{ code: string; title?: string; created_at?: string }>(`/api/share/${shareId}`),
}

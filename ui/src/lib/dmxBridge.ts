const DMX_HTTP_TOKEN = import.meta.env.VITE_DMX_HTTP_TOKEN?.trim()

export const getDmxPostHeaders = (hasJsonBody = true): HeadersInit | undefined => {
  const headers: Record<string, string> = {}

  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json'
  }

  if (DMX_HTTP_TOKEN) {
    headers.Authorization = `Bearer ${DMX_HTTP_TOKEN}`
  }

  return Object.keys(headers).length ? headers : undefined
}

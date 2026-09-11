import { Hono } from 'hono'
import { Env } from '../index'

export const shareRoute = new Hono<{ Bindings: Env }>()

const getPublicAppUrl = (appUrl?: string) => {
  if (!appUrl) return 'https://strudel.ussyco.de'
  if (appUrl.includes('100.72.41.9') || appUrl.includes('localhost')) {
    return 'https://strudel.ussyco.de'
  }
  return appUrl
}

const normalizeShareTitle = (value: unknown) => {
  if (typeof value !== 'string') return 'Shared Strudelussy Session'
  const title = value.trim().slice(0, 80)
  return title || 'Shared Strudelussy Session'
}

// Helper function to generate a short URL-safe ID
const generateShortId = (length = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  
  return result
}

// Helper function to hash the code content
const hashCode = async (code: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// POST /api/share - Create a new share or return existing one
shareRoute.post('/', async (c) => {
  try {
    // Per-IP rate limiting (prevents share spam/abuse)
    // Same limit as generate since sharing is a similar user action
    if (c.env.RATE_LIMITER_IP) {
      const clientIP = c.req.header('cf-connecting-ip') || 'anonymous'
      const { success } = await c.env.RATE_LIMITER_IP.limit({ key: clientIP })
      
      if (!success) {
        return c.json({ 
          error: 'Rate limit exceeded. Please wait a moment before sharing more patterns.',
          retryAfter: 60 
        }, 429)
      }
    }

    const body = await c.req.json()
    const { code } = body
    const title = normalizeShareTitle(body.title)

    if (!code || typeof code !== 'string') {
      return c.json({ error: 'Code is required' }, 400)
    }

    // Limit code to 100k characters to prevent abuse
    if (code.length > 100000) {
      return c.json({ error: 'Code exceeds maximum length of 100,000 characters' }, 400)
    }

    // Generate hash of the code
    const codeHash = await hashCode(code)

    // Check if this hash already has a share URL
    const existingId = await c.env.SHARES_KV.get(`hash:${codeHash}`)
    
    if (existingId) {
      // Return existing share URL
      const publicAppUrl = getPublicAppUrl(c.env.APP_URL)
      return c.json({ 
        id: existingId,
        url: `${publicAppUrl}/share/${existingId}`,
        isNew: false
      })
    }

    // Generate a new short ID
    let shareId = generateShortId()
    
    // Ensure the ID is unique (very unlikely collision, but let's be safe)
    let attempts = 0
    while (await c.env.SHARES_KV.get(`share:${shareId}`) && attempts < 10) {
      shareId = generateShortId()
      attempts++
    }

    if (attempts >= 10) {
      return c.json({ error: 'Failed to generate unique share ID' }, 500)
    }

    // Store the pattern with the share ID
    await c.env.SHARES_KV.put(`share:${shareId}`, code)
    await c.env.SHARES_KV.put(`share:${shareId}:meta`, JSON.stringify({ title, created_at: new Date().toISOString() }))
    
    // Store the hash -> ID mapping for deduplication
    await c.env.SHARES_KV.put(`hash:${codeHash}`, shareId)

    const publicAppUrl = getPublicAppUrl(c.env.APP_URL)
    return c.json({ 
      id: shareId,
      url: `${publicAppUrl}/share/${shareId}`,
      isNew: true
    })
  } catch (error) {
    console.error('Error creating share:', error)
    return c.json({ error: 'Failed to create share' }, 500)
  }
})

// GET /api/share/:id - Retrieve a shared pattern
shareRoute.get('/:id', async (c) => {
  try {
    // Rate limiting for GET requests (prevents enumeration/brute-force attacks)
    // Use a higher limit than POST since this is just a read operation
    if (c.env.RATE_LIMITER_IP) {
      const clientIP = c.req.header('cf-connecting-ip') || 'anonymous'
      const { success } = await c.env.RATE_LIMITER_IP.limit({ key: `get:${clientIP}` })
      
      if (!success) {
        return c.json({ 
          error: 'Rate limit exceeded. Please wait a moment before loading more patterns.',
          retryAfter: 60 
        }, 429)
      }
    }

    const shareId = c.req.param('id')

    if (!shareId) {
      return c.json({ error: 'Share ID is required' }, 400)
    }

    // Validate share ID format (only allow valid characters, max 16 chars)
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(shareId)) {
      return c.json({ error: 'Invalid share ID format' }, 400)
    }

    const [code, rawMeta] = await Promise.all([
      c.env.SHARES_KV.get(`share:${shareId}`),
      c.env.SHARES_KV.get(`share:${shareId}:meta`),
    ])

    if (!code) {
      return c.json({ error: 'Share not found' }, 404)
    }

    const meta = rawMeta ? JSON.parse(rawMeta) as { title?: string; created_at?: string } : {}
    return c.json({ code, title: normalizeShareTitle(meta.title), created_at: meta.created_at })
  } catch (error) {
    console.error('Error retrieving share:', error)
    return c.json({ error: 'Failed to retrieve share' }, 500)
  }
})

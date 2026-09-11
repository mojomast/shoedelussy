import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { generateRoute } from './routes/generate'
import { shareRoute } from './routes/share'
import { chatRoute } from './routes/chat'
import { projectsRoute } from './routes/projects'
import { buildMcpHandler } from './routes/mcp'
import { setEnvContext, isDevelopment } from './lib/env'

export type Env = {
  // Default LLM provider configuration (OpenAI-compatible). Falls back to OpenRouter.
  LLM_BASE_URL?: string
  LLM_API_KEY?: string
  LLM_MODEL?: string
  // Legacy OpenRouter configuration (still honored when LLM_* is unset)
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
  APP_URL?: string
  MCP_SECRET?: string
  NODE_ENV?: string
  // KV namespace for shared patterns
  SHARES_KV: KVNamespace
  PROJECTS_KV: KVNamespace
  // Rate limiters (optional)
  RATE_LIMITER_GLOBAL?: any  // Overall system protection
  RATE_LIMITER_IP?: any      // Per-IP protection for expensive endpoints
}

const app = new Hono<{ Bindings: Env }>()

// Environment context middleware - set env context from c.env for Cloudflare Workers
app.use('*', async (c, next) => {
  if (c.env) {
    setEnvContext(c.env);
  }
  await next();
});

// CORS middleware
app.use('/*', cors({
  origin: (origin) => {
    // In development, reflect the incoming origin so local/Tailscale testing works.
    if (isDevelopment() && origin) {
      return origin;
    }
    // In production, only allow specific production origins
    const allowedOrigins = [
        'https://strudel.ussyco.de',
        'https://shoe.ussyco.de',
        'https://shoedelussy.ussyco.de',
      ];
      return allowedOrigins.includes(origin || '') ? origin : undefined;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

// Global rate limiting middleware (protects against total system overload)
app.use('/api/*', async (c, next) => {
  if (c.env.RATE_LIMITER_GLOBAL) {
    const { success } = await c.env.RATE_LIMITER_GLOBAL.limit({ key: 'global' })
    
    if (!success) {
      return c.json({ 
        error: 'Service is currently experiencing high demand. Please try again shortly.',
        retryAfter: 60 
      }, 503)
    }
  }
  await next()
})

// Health check
app.get('/', (c) => {
  return c.json({ 
    status: 'ok',
    message: 'shoedelussy API',
    version: '0.0.1'
  })
})

// API routes
app.route('/api/generate', generateRoute)
app.route('/api/chat', chatRoute)
app.route('/api/projects', projectsRoute)
app.route('/api/share', shareRoute)

app.all('/mcp', async (c) => {
  const secret = c.env.MCP_SECRET
  if (secret) {
    const auth = c.req.header('authorization') ?? ''
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== secret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  return buildMcpHandler(c)
})

export default app

import type { Context, Next } from 'hono'
import type { Env, AuthContext, UserRole, HonoVariables } from '../types'

// ── JWKS helpers ─────────────────────────────────────────────────────────────

const JWKS_KV_KEY = 'clerk:jwks'
const JWKS_TTL_S = 3600 // 1 hour

interface JWKSet {
  keys: JsonWebKey[]
}

async function getJWKS(env: Env): Promise<JWKSet> {
  const cached = await env.KV.get<JWKSet>(JWKS_KV_KEY, 'json')
  if (cached) return cached

  const res = await fetch(env.CLERK_JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)

  const jwks = await res.json<JWKSet>()
  await env.KV.put(JWKS_KV_KEY, JSON.stringify(jwks), { expirationTtl: JWKS_TTL_S })
  return jwks
}

// ── JWT verification (Web Crypto — no npm required) ──────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

interface JWTPayload {
  sub: string
  exp?: number
  nbf?: number
  iss?: string
  org_id?: string
  public_metadata?: { role?: UserRole; hub_id?: string; org_id?: string }
}

async function verifyClerkJWT(token: string, env: Env): Promise<AuthContext> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT')

  const [headerB64, payloadB64, sigB64] = parts

  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as {
    kid?: string
    alg?: string
  }
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as JWTPayload

  // Validate time claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) throw new Error('Token expired')
  if (payload.nbf && payload.nbf > now) throw new Error('Token not yet valid')

  // Validate issuer
  if (env.CLERK_ISSUER && payload.iss !== env.CLERK_ISSUER) {
    throw new Error('Invalid issuer')
  }

  // Find matching JWKS key
  const jwks = await getJWKS(env)
  const jwk = jwks.keys.find((k) => (k as { kid?: string }).kid === header.kid)
  if (!jwk) throw new Error('No matching JWK for kid')

  // Import public key and verify signature
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = b64urlDecode(sigB64)

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signingInput)
  if (!valid) throw new Error('Invalid signature')

  // Extract role from Clerk public_metadata
  const meta = payload.public_metadata ?? {}
  const role = (meta.role ?? 'agent') as UserRole

  return {
    userId: payload.sub,
    orgId: payload.org_id ?? meta.org_id ?? '',
    role,
    hubId: meta.hub_id,
  }
}

// ── Middleware factories ──────────────────────────────────────────────────────

/** Require a valid Clerk JWT. Optionally restrict to specific roles. */
export function requireAuth(...allowedRoles: UserRole[]) {
  return async (
    c: Context<{ Bindings: Env; Variables: HonoVariables }>,
    next: Next,
  ): Promise<Response | void> => {
    // ── Dev bypass ────────────────────────────────────────────────────────────
    // In local development (no Clerk secrets set) inject a default admin context
    // so you can test routes without a real JWT.
    if (c.env.ENVIRONMENT === 'development' && !c.env.CLERK_JWKS_URL) {
      c.set('auth', {
        userId: 'dev_user',
        orgId: 'dev_tenant',
        role: 'admin',
        hubId: undefined,
      })
      await next()
      return
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    try {
      const auth = await verifyClerkJWT(authHeader.slice(7), c.env)

      if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
        return c.json({ error: 'Forbidden', required: allowedRoles }, 403)
      }

      c.set('auth', auth)
      await next()
    } catch (err) {
      return c.json({ error: 'Unauthorized', detail: (err as Error).message }, 401)
    }
  }
}

/** Require a seller API key (X-Api-Key header). Sets sellerId + tenantId on context. */
export function requireApiKey() {
  return async (
    c: Context<{ Bindings: Env; Variables: HonoVariables }>,
    next: Next,
  ): Promise<Response | void> => {
    const apiKey = c.req.header('X-Api-Key')
    if (!apiKey) return c.json({ error: 'X-Api-Key header required' }, 401)

    const keyHash = await sha256hex(apiKey)
    const seller = await c.env.DB.prepare(
      'SELECT id, tenant_id FROM sellers WHERE api_key_hash = ? LIMIT 1',
    )
      .bind(keyHash)
      .first<{ id: string; tenant_id: string }>()

    if (!seller) return c.json({ error: 'Invalid API key' }, 401)

    c.set('sellerId', seller.id)
    c.set('tenantId', seller.tenant_id)
    await next()
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

export async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** HMAC-SHA256 hex, used for tracking tokens and webhook signatures. */
export async function hmacSHA256(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret)
  const msgData = new TextEncoder().encode(message)

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, msgData)
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

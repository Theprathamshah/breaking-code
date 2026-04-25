import type { Env } from '../../../types'
import { hmacSHA256 } from '../../../middleware/auth'

export async function mintTrackingToken(env: Env, orderId: string, tenantId: string): Promise<string> {
  const signature = await hmacSHA256(env.HMAC_SECRET, `${orderId}:${tenantId}`)
  return `tk_${signature.slice(0, 16)}`
}

export async function storeTrackingToken(env: Env, token: string, orderId: string): Promise<void> {
  await env.KV.put(`tracking_token:${token}`, orderId, { expirationTtl: 60 * 60 * 24 * 30 })
}

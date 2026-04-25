import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../../types'

/**
 * DeliverySessionDO — Domain 4
 *
 * One instance per active delivery agent. Manages:
 *   - Agent's GPS WebSocket (write)
 *   - Customer tracking WebSockets (read, keyed by orderId)
 *   - Real-time GPS fan-out to customers whose stop is in `heading_to` state
 *
 * Full implementation lives in Domain 4.
 * This stub exports the class so it can be registered as a DO binding.
 */
export class DeliverySessionDO extends DurableObject<Env> {
  private agentSocket: WebSocket | null = null
  private lastGPS: { lat: number; lng: number; ts: number } | null = null

  // orderId → Set of customer WebSockets
  private subscribers = new Map<string, Set<WebSocket>>()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const type = url.searchParams.get('type') // 'agent' | 'customer'
    const orderId = url.searchParams.get('orderId')

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const { 0: client, 1: server } = new WebSocketPair()

    if (type === 'agent') {
      this.handleAgentSocket(server)
    } else if (type === 'customer' && orderId) {
      this.handleCustomerSocket(server, orderId)
    } else {
      return new Response('Missing type or orderId', { status: 400 })
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  private handleAgentSocket(ws: WebSocket) {
    this.ctx.acceptWebSocket(ws)
    this.agentSocket = ws

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          lat: number
          lng: number
          speed?: number
          heading?: number
        }

        this.lastGPS = { lat: data.lat, lng: data.lng, ts: Date.now() }
        this.broadcastGPS(data.lat, data.lng)
      } catch {
        // Ignore malformed GPS pings
      }
    })

    ws.addEventListener('close', () => {
      this.agentSocket = null
    })
  }

  private handleCustomerSocket(ws: WebSocket, orderId: string) {
    this.ctx.acceptWebSocket(ws)

    if (!this.subscribers.has(orderId)) {
      this.subscribers.set(orderId, new Set())
    }
    this.subscribers.get(orderId)!.add(ws)

    // Send last known GPS immediately on connect
    if (this.lastGPS) {
      ws.send(
        JSON.stringify({
          event: 'gps',
          lat: this.lastGPS.lat,
          lng: this.lastGPS.lng,
          ts: this.lastGPS.ts,
        }),
      )
    }

    ws.addEventListener('close', () => {
      this.subscribers.get(orderId)?.delete(ws)
      if (this.subscribers.get(orderId)?.size === 0) {
        this.subscribers.delete(orderId)
      }
    })
  }

  private broadcastGPS(lat: number, lng: number) {
    const payload = JSON.stringify({ event: 'gps', lat, lng, ts: Date.now() })

    for (const [, sockets] of this.subscribers) {
      for (const ws of sockets) {
        try {
          ws.send(payload)
        } catch {
          // Socket may have closed; remove on next iteration
        }
      }
    }
  }

  /** Called by Domain 3 when a stop is delivered/failed — close customer sockets. */
  closeOrderSockets(orderId: string, event: 'delivered' | 'failed') {
    const sockets = this.subscribers.get(orderId)
    if (!sockets) return

    const payload = JSON.stringify({ event })
    for (const ws of sockets) {
      try {
        ws.send(payload)
        ws.close(1000, event)
      } catch {
        // ignore
      }
    }
    this.subscribers.delete(orderId)
  }
}

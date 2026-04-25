import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { X, ChevronDown, ChevronRight, Activity, Zap } from 'lucide-react'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { eventsApi, type DeliveryEvent, type AppendEventPayload } from '../../lib/api'

interface OrderAuditTrailProps {
  orderId: string
  customerName: string
  onClose: () => void
}

const ACTOR_COLORS: Record<string, string> = {
  system: 'var(--frost)',
  admin: 'var(--amber)',
  agent: 'var(--volt)',
  seller: 'var(--ice)',
  customer: 'var(--signal)',
}

const EVENT_LABELS: Record<string, string> = {
  'order.created': 'Order Created',
  'order.status_changed': 'Status Changed',
  'order.delivered': 'Delivered',
  'order.failed': 'Delivery Failed',
  'order.rescheduled': 'Rescheduled',
  'agent.assigned': 'Agent Assigned',
  'route.activated': 'Route Activated',
  'stop.departed': 'Departed to Stop',
  'stop.arrived': 'Arrived at Stop',
  'agent.gps_ping': 'GPS Ping',
  'otp.requested': 'OTP Requested',
  'otp.verified': 'OTP Verified',
  'otp.failed': 'OTP Failed',
  'photo.uploaded': 'Photo Uploaded',
  'feedback.submitted': 'Feedback Submitted',
  'fare.settled': 'Fare Settled',
}

export function OrderAuditTrail({ orderId, customerName, onClose }: OrderAuditTrailProps) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [fireOpen, setFireOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-events', orderId, eventTypeFilter],
    queryFn: async () => {
      const t = await getToken({ template: 'default' })
      return eventsApi.getOrderEvents(t ?? '', orderId, {
        limit: 200,
        eventType: eventTypeFilter || undefined,
      })
    },
    enabled: !!orderId,
  })

  const fireMutation = useMutation({
    mutationFn: async (payload: AppendEventPayload) => {
      const t = await getToken({ template: 'default' })
      return eventsApi.appendEvent(t ?? '', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-events', orderId] })
      setFireOpen(false)
    },
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: 480,
          maxWidth: '100vw',
          height: '100%',
          background: 'var(--void)',
          borderLeft: '1px solid var(--rim)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--rim)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: 'rgba(200,255,87,0.12)',
              border: '1px solid rgba(200,255,87,0.3)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Activity size={16} color="var(--volt)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--chalk)', marginBottom: 2 }}>
              Audit Trail
            </p>
            <p style={{ fontSize: 12, color: 'var(--frost)', fontFamily: 'var(--font-mono)' }}>
              {customerName} · {orderId.slice(-10).toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--muted)',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--rim)' }}>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={{
              background: 'var(--shell)',
              border: '1px solid var(--rim)',
              borderRadius: 6,
              color: 'var(--chalk)',
              fontSize: 12,
              padding: '6px 10px',
              width: '100%',
              fontFamily: 'var(--font-body)',
            }}
          >
            <option value="">All event types</option>
            {Object.entries(EVENT_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Event list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
              <Spinner size={24} />
            </div>
          )}

          {isError && (
            <p style={{ fontSize: 13, color: 'var(--signal)', padding: '24px 20px', textAlign: 'center' }}>
              Failed to load events
            </p>
          )}

          {data?.events.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: '24px 20px', textAlign: 'center' }}>
              No events found
            </p>
          )}

          {data?.events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              expanded={expandedId === ev.id}
              onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
            />
          ))}
        </div>

        {/* Footer: event count + Fire Event button */}
        <div
          style={{
            borderTop: '1px solid var(--rim)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {data ? `${data.events.length} event${data.events.length !== 1 ? 's' : ''}` : ''}
              {data?.nextCursor ? ' · scroll for more' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFireOpen((o) => !o)}
            >
              <Zap size={12} />
              {fireOpen ? 'Cancel' : 'Fire Event'}
            </Button>
          </div>

          {/* Fire event form */}
          {fireOpen && (
            <FireEventForm
              orderId={orderId}
              loading={fireMutation.isPending}
              error={fireMutation.error?.message ?? null}
              onSubmit={(payload) => fireMutation.mutate(payload)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fire Event Form ───────────────────────────────────────────────────────────

const ACTOR_OPTIONS = ['system', 'admin', 'agent', 'seller', 'customer'] as const
const EVENT_TYPE_OPTIONS = Object.keys(EVENT_LABELS) as (keyof typeof EVENT_LABELS)[]

function FireEventForm({
  orderId,
  loading,
  error,
  onSubmit,
}: {
  orderId: string
  loading: boolean
  error: string | null
  onSubmit: (payload: AppendEventPayload) => void
}) {
  const [eventType, setEventType] = useState(EVENT_TYPE_OPTIONS[0])
  const [actorType, setActorType] = useState<AppendEventPayload['actorType']>('admin')
  const [metaRaw, setMetaRaw] = useState('{}')
  const [metaError, setMetaError] = useState<string | null>(null)

  function handleSubmit() {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = JSON.parse(metaRaw)
      setMetaError(null)
    } catch {
      setMetaError('Invalid JSON')
      return
    }
    onSubmit({ orderId, actorType, eventType, metadata })
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--shell)',
    border: '1px solid var(--rim)',
    borderRadius: 6,
    color: 'var(--chalk)',
    fontSize: 12,
    padding: '6px 10px',
    width: '100%',
    fontFamily: 'var(--font-body)',
    boxSizing: 'border-box',
  }

  return (
    <div
      style={{
        padding: '14px 20px 16px',
        borderTop: '1px solid var(--rim)',
        background: 'rgba(200,255,87,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--volt)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Fire Event
      </p>

      {/* Event type + actor side by side */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 10, color: 'var(--frost)', display: 'block', marginBottom: 4 }}>
            Event type
          </label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
            {EVENT_TYPE_OPTIONS.map((v) => (
              <option key={v} value={v}>{EVENT_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: 'var(--frost)', display: 'block', marginBottom: 4 }}>
            Actor
          </label>
          <select
            value={actorType}
            onChange={(e) => setActorType(e.target.value as AppendEventPayload['actorType'])}
            style={inputStyle}
          >
            {ACTOR_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metadata */}
      <div>
        <label style={{ fontSize: 10, color: 'var(--frost)', display: 'block', marginBottom: 4 }}>
          Metadata (JSON)
        </label>
        <textarea
          value={metaRaw}
          onChange={(e) => setMetaRaw(e.target.value)}
          rows={3}
          style={{
            ...inputStyle,
            fontFamily: 'var(--font-mono)',
            resize: 'vertical',
          }}
        />
        {metaError && (
          <p style={{ fontSize: 11, color: 'var(--signal)', marginTop: 3 }}>{metaError}</p>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 11, color: 'var(--signal)' }}>{error}</p>
      )}

      <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>
        <Zap size={12} />
        Send
      </Button>
    </div>
  )
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: DeliveryEvent
  expanded: boolean
  onToggle: () => void
}) {
  const hasMetadata = Object.keys(event.metadata).length > 0
  const actorColor = ACTOR_COLORS[event.actorType] ?? 'var(--frost)'

  return (
    <div
      style={{
        borderBottom: '1px solid var(--rim)',
        padding: '10px 20px',
        cursor: hasMetadata ? 'pointer' : 'default',
      }}
      onClick={hasMetadata ? onToggle : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Actor badge */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: actorColor,
            border: `1px solid ${actorColor}`,
            borderRadius: 3,
            padding: '1px 5px',
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            opacity: 0.85,
          }}
        >
          {event.actorType}
        </span>

        {/* Event type */}
        <span style={{ fontSize: 13, color: 'var(--chalk)', flex: 1, minWidth: 0 }}>
          {EVENT_LABELS[event.eventType] ?? event.eventType}
        </span>

        {/* Timestamp */}
        <span
          style={{
            fontSize: 11,
            color: 'var(--frost)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          {fmtTs(event.createdAt)}
        </span>

        {/* Expand toggle */}
        {hasMetadata && (
          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </div>

      {/* Expanded metadata */}
      {expanded && hasMetadata && (
        <pre
          style={{
            marginTop: 10,
            background: 'var(--shell)',
            border: '1px solid var(--rim)',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--frost)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(event.metadata, null, 2)}
        </pre>
      )}

      {/* GPS coords if present */}
      {event.lat != null && event.lng != null && (
        <p
          style={{
            marginTop: 4,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--muted)',
          }}
        >
          {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
        </p>
      )}
    </div>
  )
}

function fmtTs(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

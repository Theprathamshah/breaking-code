import { useState } from 'react'
import { createPortal } from 'react-dom'
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
  system:   'var(--frost)',
  admin:    'var(--amber)',
  agent:    'var(--volt)',
  seller:   'var(--ice)',
  customer: 'var(--signal)',
}

const EVENT_LABELS: Record<string, string> = {
  'order.created':        'Order Created',
  'order.status_changed': 'Status Changed',
  'order.delivered':      'Delivered',
  'order.failed':         'Delivery Failed',
  'order.rescheduled':    'Rescheduled',
  'agent.assigned':       'Agent Assigned',
  'route.activated':      'Route Activated',
  'stop.departed':        'Departed to Stop',
  'stop.arrived':         'Arrived at Stop',
  'agent.gps_ping':       'GPS Ping',
  'otp.requested':        'OTP Requested',
  'otp.verified':         'OTP Verified',
  'otp.failed':           'OTP Failed',
  'photo.uploaded':       'Photo Uploaded',
  'feedback.submitted':   'Feedback Submitted',
  'fare.settled':         'Fare Settled',
}

// ── Main component ────────────────────────────────────────────────────────────

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

  return createPortal(
    <>
      {/* ── Audit trail dialog ───────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        {/* Backdrop */}
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
          onClick={onClose}
        />

        {/* Dialog */}
        <div
          style={{
            position: 'relative',
            width: 560,
            maxWidth: '100%',
            // Key: explicit height + flex column so the list can scroll
            height: 'min(680px, 88vh)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--void)',
            border: '1px solid var(--rim)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Header — fixed, never scrolls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 20px',
              borderBottom: '1px solid var(--rim)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                background: 'rgba(200,255,87,0.12)',
                border: '1px solid rgba(200,255,87,0.25)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Activity size={15} color="var(--volt)" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--chalk)', lineHeight: 1 }}>
                Audit Trail
              </p>
              <p style={{ fontSize: 11, color: 'var(--frost)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                {customerName} · {orderId.slice(-10).toUpperCase()}
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                display: 'flex',
                padding: 4,
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter bar — fixed */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--rim)', flexShrink: 0 }}>
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
                outline: 'none',
              }}
            >
              <option value="">All event types</option>
              {Object.entries(EVENT_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {/* Event list — THIS is the scrollable region.
              min-height: 0 is essential: without it a flex child won't shrink
              below its content size, so overflow-y: auto never kicks in. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
                <Spinner size={22} />
              </div>
            )}
            {isError && (
              <p style={{ fontSize: 13, color: 'var(--signal)', padding: '24px 20px', textAlign: 'center' }}>
                Failed to load events
              </p>
            )}
            {!isLoading && data?.events.length === 0 && (
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

          {/* Footer — fixed, always visible */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              borderTop: '1px solid var(--rim)',
              flexShrink: 0,
              background: 'var(--void)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {data
                ? `${data.events.length} event${data.events.length !== 1 ? 's' : ''}${data.nextCursor ? ' · more available' : ''}`
                : ''}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setFireOpen(true)}>
              <Zap size={12} />
              Fire Event
            </Button>
          </div>
        </div>
      </div>

      {/* ── Fire Event dialog — separate modal on top (z-index: 60) ─────────── */}
      {fireOpen && (
        <FireEventDialog
          orderId={orderId}
          loading={fireMutation.isPending}
          error={fireMutation.error?.message ?? null}
          onSubmit={(payload) => fireMutation.mutate(payload)}
          onClose={() => setFireOpen(false)}
        />
      )}
    </>,
    document.body,
  )
}

// ── Fire Event dialog ─────────────────────────────────────────────────────────

const ACTOR_OPTIONS = ['system', 'admin', 'agent', 'seller', 'customer'] as const
const EVENT_TYPE_OPTIONS = Object.keys(EVENT_LABELS)

function FireEventDialog({
  orderId,
  loading,
  error,
  onSubmit,
  onClose,
}: {
  orderId: string
  loading: boolean
  error: string | null
  onSubmit: (payload: AppendEventPayload) => void
  onClose: () => void
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
    padding: '7px 10px',
    width: '100%',
    fontFamily: 'var(--font-body)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Backdrop — closes only the fire dialog, audit trail stays */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      />

      <div
        style={{
          position: 'relative',
          width: 420,
          maxWidth: '100%',
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--rim)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                background: 'rgba(255,184,0,0.12)',
                border: '1px solid rgba(255,184,0,0.25)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={13} color="var(--amber)" />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--chalk)' }}>Fire Event</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Event type */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--frost)', display: 'block', marginBottom: 5 }}>
              Event type
            </label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
              {EVENT_TYPE_OPTIONS.map((v) => (
                <option key={v} value={v}>{EVENT_LABELS[v]}</option>
              ))}
            </select>
          </div>

          {/* Actor */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--frost)', display: 'block', marginBottom: 5 }}>
              Actor
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ACTOR_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => setActorType(a)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${actorType === a ? ACTOR_COLORS[a] : 'var(--rim)'}`,
                    background: actorType === a ? `${ACTOR_COLORS[a]}18` : 'transparent',
                    color: actorType === a ? ACTOR_COLORS[a] : 'var(--muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                    transition: 'all 0.1s',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--frost)', display: 'block', marginBottom: 5 }}>
              Metadata <span style={{ color: 'var(--muted)' }}>(JSON)</span>
            </label>
            <textarea
              value={metaRaw}
              onChange={(e) => setMetaRaw(e.target.value)}
              rows={4}
              spellCheck={false}
              style={{
                ...inputStyle,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
            {metaError && (
              <p style={{ fontSize: 11, color: 'var(--signal)', marginTop: 4 }}>{metaError}</p>
            )}
          </div>

          {error && (
            <p style={{ fontSize: 11, color: 'var(--signal)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 18px',
            borderTop: '1px solid var(--rim)',
            background: 'var(--shell)',
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>
            <Zap size={12} />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Event Row ─────────────────────────────────────────────────────────────────

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
        padding: '9px 20px',
        cursor: hasMetadata ? 'pointer' : 'default',
      }}
      onClick={hasMetadata ? onToggle : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Actor badge */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: actorColor,
            border: `1px solid ${actorColor}`,
            borderRadius: 3,
            padding: '1px 5px',
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            opacity: 0.9,
          }}
        >
          {event.actorType}
        </span>

        {/* Event type */}
        <span style={{ fontSize: 12, color: 'var(--chalk)', flex: 1, minWidth: 0 }}>
          {EVENT_LABELS[event.eventType] ?? event.eventType}
        </span>

        {/* Timestamp */}
        <span style={{ fontSize: 10, color: 'var(--frost)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {fmtTs(event.createdAt)}
        </span>

        {hasMetadata && (
          <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex' }}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      {expanded && hasMetadata && (
        <pre
          style={{
            marginTop: 8,
            background: 'var(--shell)',
            border: '1px solid var(--rim)',
            borderRadius: 6,
            padding: '8px 10px',
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

      {event.lat != null && event.lng != null && (
        <p style={{ marginTop: 3, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
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

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Radio, PackageCheck, PackageX, Clock, MapPin } from 'lucide-react'
import { Timeline } from '../../components/ui/Timeline'
import { Spinner } from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'
import { trackingApi } from '../../lib/api'

const STATUS_ORDER = [
  'placed',
  'confirmed',
  'packed',
  'out_for_delivery',
  'in_transit',
  'delivered',
]

const STATUS_LABELS: Record<string, string> = {
  placed: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed at Hub',
  out_for_delivery: 'Out for Delivery',
  in_transit: 'Driver Heading to You',
  delivered: 'Delivered',
  failed: 'Delivery Failed',
  rescheduled: 'Rescheduled',
}

export function TrackingPage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', token],
    queryFn: () => trackingApi.get(token!),
    enabled: !!token,
    refetchInterval: (query) => {
      if (query.state.data?.mode === 'live') return 5_000
      return 30_000
    },
  })

  if (isLoading) {
    return (
      <Page>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 80 }}>
          <Spinner size={28} />
          <p style={{ fontSize: 14, color: 'var(--frost)' }}>Loading tracking info…</p>
        </div>
      </Page>
    )
  }

  if (isError || !data) {
    return (
      <Page>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 80, textAlign: 'center' }}>
          <PackageX size={40} color="var(--signal)" />
          <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--chalk)' }}>Link expired or invalid</p>
          <p style={{ fontSize: 13, color: 'var(--frost)' }}>
            This tracking link may have expired. Check your email for an updated link.
          </p>
        </div>
      </Page>
    )
  }

  const { order, mode, statusTimeline, agentName, eta } = data
  const currentIdx = STATUS_ORDER.indexOf(order.status)

  const timelineSteps = STATUS_ORDER.filter((s) => s !== 'in_transit' || mode === 'live').map((s, i) => {
    const tsEntry = statusTimeline?.find((e) => e.status === s)
    return {
      status: s,
      label: STATUS_LABELS[s] ?? s,
      ts: tsEntry?.ts,
      done: STATUS_ORDER.indexOf(s) < currentIdx,
      current: s === order.status,
    }
  })

  return (
    <Page>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: 'var(--volt)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Truck size={18} color="var(--obsidian)" />
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--frost)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tracking
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--chalk)' }}>
              {order.id.slice(-10).toUpperCase()}
            </p>
          </div>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--chalk)',
            marginBottom: 6,
          }}
        >
          {order.customerName}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge status={order.status} />
          {mode === 'live' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10,
                color: 'var(--ice)',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--ice)',
                  animation: 'live-pulse 1.4s ease-in-out infinite',
                }}
              />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Live mode banner */}
      {mode === 'live' && (
        <div
          style={{
            background: 'rgba(87,200,255,0.08)',
            border: '1px solid rgba(87,200,255,0.3)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Radio size={16} color="var(--ice)" />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--chalk)' }}>
              {agentName ?? 'Your driver'} is on the way
            </span>
          </div>
          {eta && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                color: 'var(--volt)',
                fontWeight: 400,
                marginLeft: 26,
              }}
            >
              ETA {fmtTime(eta)}
            </p>
          )}

          {/* Map placeholder */}
          <div
            style={{
              height: 200,
              background: 'var(--shell)',
              borderRadius: 'var(--r-sm)',
              marginTop: 14,
              border: '1px solid var(--rim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <MapPin size={24} color="var(--muted)" />
            <p style={{ fontSize: 12, color: 'var(--frost)' }}>
              Live map — connect Mapbox API key
            </p>
          </div>
        </div>
      )}

      {/* Delivery address */}
      <div
        style={{
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-md)',
          padding: '14px 16px',
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <MapPin size={16} color="var(--frost)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 10, color: 'var(--frost)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
            Delivering to
          </p>
          <p style={{ fontSize: 14, color: 'var(--chalk)' }}>{order.address}</p>
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-md)',
          padding: '20px 20px',
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--frost)',
            marginBottom: 20,
          }}
        >
          Delivery Timeline
        </p>
        <Timeline steps={timelineSteps} />
      </div>

      {/* Delivered / Failed final state */}
      {order.status === 'delivered' && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            background: 'rgba(200,255,87,0.08)',
            border: '1px solid rgba(200,255,87,0.25)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <PackageCheck size={24} color="var(--volt)" />
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--volt)' }}>
              Delivered successfully
            </p>
            <p style={{ fontSize: 12, color: 'var(--frost)', marginTop: 2 }}>
              Your parcel has been delivered. Thank you!
            </p>
          </div>
        </div>
      )}

      {order.status === 'failed' && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            background: 'rgba(255,92,40,0.08)',
            border: '1px solid rgba(255,92,40,0.25)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <PackageX size={24} color="var(--signal)" />
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--signal)' }}>
              Delivery attempt failed
            </p>
            <p style={{ fontSize: 12, color: 'var(--frost)', marginTop: 2 }}>
              We'll contact you to reschedule.
            </p>
          </div>
        </div>
      )}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--obsidian)',
        minHeight: '100dvh',
        maxWidth: 520,
        margin: '0 auto',
        padding: '24px 16px 40px',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid var(--rim)',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            background: 'var(--volt)',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Truck size={13} color="var(--obsidian)" />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--chalk)',
          }}
        >
          LastMile
        </span>
      </div>
      {children}
    </div>
  )
}

function fmtTime(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

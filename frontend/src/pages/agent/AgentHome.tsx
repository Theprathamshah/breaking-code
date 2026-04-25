import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth, useUser } from '@clerk/clerk-react'
import {
  Truck,
  MapPin,
  ChevronRight,
  Radio,
  IndianRupee,
  Navigation,
  CheckCircle,
  XCircle,
  KeyRound,
} from 'lucide-react'
import { Shell } from '../../components/layout/Shell'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { agentsApi, routesApi, d4Api, type RouteStop } from '../../lib/api'

/**
 * Agent PWA — mobile-first, single column.
 * Shows the agent's route for today + quick stop actions.
 */
export function AgentHome() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const qc = useQueryClient()
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [agentId] = useState<string | null>(null)

  // In a real app, agentId comes from user metadata (set during onboarding)
  const mockAgentId = agentId ?? (user?.publicMetadata?.agentId as string | undefined) ?? null

  // Fetch today's route for this agent
  const { data: routeData, isLoading: routeLoading } = useQuery({
    queryKey: ['agent-route', mockAgentId],
    queryFn: async () => {
      if (!mockAgentId) return null
      const token = await getToken({template:"default"})
      const today = new Date().toISOString().slice(0, 10)
      const routes = await routesApi.list(token ?? '', { date: today })
      // In prod, we'd filter by agent_id from the token
      const myRoute = routes.routes.find(
        (r) => r.agent_id === mockAgentId && r.status !== 'completed',
      )
      if (!myRoute) return null
      return routesApi.get(token ?? '', myRoute.id)
    },
    enabled: !!mockAgentId,
    refetchInterval: 30_000,
  })

  const goOnlineMutation = useMutation({
    mutationFn: async (status: 'available' | 'offline') => {
      if (!mockAgentId) return
      const token = await getToken({template:"default"})
      return agentsApi.updateStatus(token ?? '', mockAgentId, status)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-route'] }),
  })

  const stops = routeData?.stops ?? []
  const routeId = routeData?.id ?? null
  const completed = stops.filter((s) => s.status === 'delivered').length
  const total = stops.length

  return (
    <Shell title="Agent View">
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
          fontFamily: 'var(--font-body)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--obsidian)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Top bar */}
        <header
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--rim)',
            background: 'var(--void)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--shell)',
                  border: '1px solid var(--rim)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} width={32} height={32} alt="" />
                ) : (
                  <span style={{ fontSize: 14, color: 'var(--frost)', fontWeight: 600 }}>
                    {user?.firstName?.[0] ?? 'A'}
                  </span>
                )}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--chalk)' }}>
                  {user?.firstName ?? 'Agent'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--frost)' }}>
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => goOnlineMutation.mutate('available')}
              loading={goOnlineMutation.isPending}
            >
              Go Online
            </Button>
          </div>

          {/* Stats row */}
          {total > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 14,
              }}
            >
              <MiniStat label="Stops" value={`${completed}/${total}`} />
              <MiniStat
                label="Distance"
                value={`${routeData?.total_distance_km ?? 0} km`}
              />
              <MiniStat
                label="Earnings"
                value={`₹${(completed * 47).toFixed(0)}`}
                accent
              />
            </div>
          )}
        </header>

        {/* Route progress bar */}
        {total > 0 && (
          <div
            style={{
              height: 3,
              background: 'var(--rim)',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(completed / total) * 100}%`,
                background: 'var(--volt)',
                transition: 'width var(--dur-slow) var(--ease-out)',
              }}
            />
          </div>
        )}

        {/* Body */}
        <main style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {routeLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
              <Spinner />
            </div>
          ) : stops.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 80,
                gap: 16,
                textAlign: 'center',
              }}
            >
              <Truck size={40} color="var(--muted)" />
              <div>
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--chalk)', marginBottom: 6 }}>
                  No route assigned
                </p>
                <p style={{ fontSize: 13, color: 'var(--frost)' }}>
                  Go online and wait for the dispatcher to assign a route.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--frost)',
                  marginBottom: 12,
                }}
              >
                My Route — {total} stops
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stops.map((stop) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    onOpen={() => setSelectedStop(stop)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Stop detail sheet */}
        {selectedStop && routeId && (
          <StopSheet
            stop={selectedStop}
            routeId={routeId}
            onClose={() => setSelectedStop(null)}
            onDeparted={() => {
              setSelectedStop(null)
              qc.invalidateQueries({ queryKey: ['agent-route'] })
            }}
          />
        )}

        {/* Bottom nav */}
        <nav
          style={{
            borderTop: '1px solid var(--rim)',
            background: 'var(--void)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {[
            { icon: <MapPin size={20} />, label: 'Route' },
            { icon: <Radio size={20} />, label: 'Live', accent: true },
            { icon: <IndianRupee size={20} />, label: 'Earnings' },
          ].map((item) => (
            <button
              key={item.label}
              style={{
                background: 'transparent',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '12px 0',
                color: item.accent ? 'var(--volt)' : 'var(--frost)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </Shell>
  )
}

// ── Stop card ─────────────────────────────────────────────────────────────────

function StopCard({ stop, onOpen }: { stop: RouteStop; onOpen: () => void }) {
  const isDone = stop.status === 'delivered' || stop.status === 'failed'

  return (
    <div
      onClick={() => !isDone && onOpen()}
      style={{
        background: isDone ? 'transparent' : 'var(--void)',
        border: `1px solid ${
          stop.status === 'heading_to'
            ? 'var(--volt)'
            : stop.status === 'delivered'
              ? 'rgba(200,255,87,0.2)'
              : 'var(--rim)'
        }`,
        borderRadius: 'var(--r-md)',
        padding: '14px 14px',
        cursor: isDone ? 'default' : 'pointer',
        opacity: stop.status === 'delivered' ? 0.5 : 1,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
    >
      {/* Sequence */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background:
            stop.status === 'delivered'
              ? 'var(--volt)'
              : stop.status === 'failed'
                ? 'var(--signal)'
                : stop.status === 'heading_to'
                  ? 'rgba(200,255,87,0.15)'
                  : 'var(--shell)',
          border: `1px solid ${stop.status === 'heading_to' ? 'var(--volt)' : 'var(--rim)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          color:
            stop.status === 'delivered'
              ? 'var(--obsidian)'
              : 'var(--frost)',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {stop.sequence_no}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--chalk)', marginBottom: 2 }}>
          {stop.customer_name}
        </p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--frost)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stop.address}
        </p>
        {stop.eta && (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: stop.status === 'heading_to' ? 'var(--volt)' : 'var(--frost)',
              marginTop: 3,
            }}
          >
            ETA {fmtTime(stop.eta)}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Badge status={stop.status} />
        {!isDone && <ChevronRight size={14} color="var(--muted)" />}
      </div>
    </div>
  )
}

// ── Stop sheet (bottom sheet modal) ───────────────────────────────────────────
// State machine: pending → heading_to → arrived → [otp_sent] → delivered | failed

type SheetPhase = 'main' | 'otp' | 'fail'

function StopSheet({
  stop,
  routeId,
  onClose,
  onDone,
}: {
  stop: RouteStop
  routeId: string
  onClose: () => void
  onDone: () => void
}) {
  const { getToken } = useAuth()
  const [phase, setPhase] = useState<SheetPhase>('main')
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [failReason, setFailReason] = useState('')
  const [localStatus, setLocalStatus] = useState(stop.status)

  const departMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({ template: 'default' })
      return routesApi.departStop(token ?? '', routeId, stop.id)
    },
    onSuccess: () => setLocalStatus('heading_to'),
  })

  const arriveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({ template: 'default' })
      return d4Api.arrive(token ?? '', routeId, stop.id)
    },
    onSuccess: () => setLocalStatus('arrived'),
  })

  const otpRequestMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({ template: 'default' })
      return d4Api.requestOtp(token ?? '', routeId, stop.id)
    },
    onSuccess: (data) => {
      setDevOtp(data.__dev_otp ?? null)
      setPhase('otp')
    },
  })

  const otpVerifyMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({ template: 'default' })
      return d4Api.verifyOtp(token ?? '', routeId, stop.id, otpInput)
    },
    onSuccess: (data) => {
      if (data.success) {
        setLocalStatus('delivered')
        onDone()
      } else {
        setOtpError(data.message ?? 'OTP incorrect')
      }
    },
  })

  const failMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({ template: 'default' })
      return d4Api.failStop(token ?? '', routeId, stop.id, failReason || 'No reason provided')
    },
    onSuccess: () => {
      setLocalStatus('failed')
      onDone()
    },
  })

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(12,12,15,0.7)', zIndex: 40 }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          background: 'var(--void)',
          borderTop: '1px solid var(--rim)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 36px',
          zIndex: 50,
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--rim)',
            margin: '0 auto 20px',
          }}
        />

        {/* Customer info */}
        <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--chalk)', marginBottom: 3 }}>
          {stop.customer_name}
        </h3>
        {stop.customer_phone && (
          <p style={{ fontSize: 13, color: 'var(--frost)', marginBottom: 10 }}>{stop.customer_phone}</p>
        )}
        <p style={{ fontSize: 13, color: 'var(--chalk)', marginBottom: 16 }}>{stop.address}</p>

        {/* Parcel + window */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <div style={{ flex: 1, background: 'var(--shell)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--frost)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Parcel</p>
            <p style={{ fontSize: 13, color: 'var(--chalk)', marginTop: 2 }}>
              {stop.parcel_weight}kg · {stop.parcel_size}
            </p>
          </div>
          {stop.delivery_window_start && (
            <div style={{ flex: 1, background: 'var(--shell)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--frost)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Window</p>
              <p style={{ fontSize: 12, color: 'var(--chalk)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                {fmtTime(stop.delivery_window_start)} – {fmtTime(stop.delivery_window_end ?? '')}
              </p>
            </div>
          )}
        </div>

        {/* ── Phase: main ────────────────────────────────────────────────────── */}
        {phase === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Heading to stop */}
            {localStatus === 'pending' && (
              <Button
                variant="primary"
                size="lg"
                style={{ width: '100%', justifyContent: 'center' }}
                loading={departMutation.isPending}
                onClick={() => departMutation.mutate()}
              >
                <Navigation size={16} /> Head to this Stop
              </Button>
            )}

            {localStatus === 'heading_to' && (
              <Button
                variant="primary"
                size="lg"
                style={{ width: '100%', justifyContent: 'center' }}
                loading={arriveMutation.isPending}
                onClick={() => arriveMutation.mutate()}
              >
                <MapPin size={16} /> Mark as Arrived
              </Button>
            )}

            {localStatus === 'arrived' && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                  loading={otpRequestMutation.isPending}
                  onClick={() => otpRequestMutation.mutate()}
                >
                  <KeyRound size={16} /> Send OTP to Customer
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--signal)' }}
                  onClick={() => setPhase('fail')}
                >
                  <XCircle size={14} /> Mark as Failed
                </Button>
              </>
            )}

            {(departMutation.isError || arriveMutation.isError || otpRequestMutation.isError) && (
              <p style={{ fontSize: 12, color: 'var(--signal)', textAlign: 'center' }}>
                {((departMutation.error ?? arriveMutation.error ?? otpRequestMutation.error) as Error)?.message}
              </p>
            )}

            <Button variant="ghost" size="md" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
              Close
            </Button>
          </div>
        )}

        {/* ── Phase: OTP entry ──────────────────────────────────────────────── */}
        {phase === 'otp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--frost)', textAlign: 'center' }}>
              OTP sent to customer. Ask them for the 6-digit code.
            </p>
            {devOtp && (
              <div
                style={{
                  background: 'rgba(255,184,0,0.1)',
                  border: '1px solid rgba(255,184,0,0.3)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
                  DEV OTP: {devOtp}
                </p>
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otpInput}
              onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '')); setOtpError(null) }}
              style={{
                background: 'var(--shell)',
                border: `1px solid ${otpError ? 'var(--signal)' : 'var(--rim)'}`,
                borderRadius: 8,
                color: 'var(--chalk)',
                fontSize: 28,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.3em',
                padding: '12px',
                textAlign: 'center',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            {otpError && (
              <p style={{ fontSize: 12, color: 'var(--signal)', textAlign: 'center' }}>{otpError}</p>
            )}
            <Button
              variant="primary"
              size="lg"
              style={{ width: '100%', justifyContent: 'center' }}
              loading={otpVerifyMutation.isPending}
              disabled={otpInput.length !== 6}
              onClick={() => otpVerifyMutation.mutate()}
            >
              <CheckCircle size={16} /> Verify & Deliver
            </Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                size="md"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setPhase('main')}
              >
                Back
              </Button>
              <Button
                variant="ghost"
                size="md"
                style={{ flex: 1, justifyContent: 'center', color: 'var(--signal)' }}
                onClick={() => setPhase('fail')}
              >
                <XCircle size={14} /> Mark Failed
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase: fail ───────────────────────────────────────────────────── */}
        {phase === 'fail' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--frost)' }}>Why couldn't this be delivered?</p>
            {['Customer not home', 'Customer refused', 'Wrong address', 'OTP timeout'].map((r) => (
              <button
                key={r}
                onClick={() => setFailReason(r)}
                style={{
                  background: failReason === r ? 'rgba(255,77,77,0.1)' : 'var(--shell)',
                  border: `1px solid ${failReason === r ? 'var(--signal)' : 'var(--rim)'}`,
                  borderRadius: 8,
                  color: failReason === r ? 'var(--signal)' : 'var(--chalk)',
                  fontSize: 13,
                  padding: '10px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.1s',
                }}
              >
                {r}
              </button>
            ))}
            <Button
              variant="danger"
              size="lg"
              style={{ width: '100%', justifyContent: 'center' }}
              loading={failMutation.isPending}
              disabled={!failReason}
              onClick={() => failMutation.mutate()}
            >
              Confirm Failure
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setPhase('main')}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: 'var(--frost)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 700,
          color: accent ? 'var(--volt)' : 'var(--chalk)',
          marginTop: 2,
        }}
      >
        {value}
      </p>
    </div>
  )
}

function fmtTime(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  } catch {
    return ts
  }
}

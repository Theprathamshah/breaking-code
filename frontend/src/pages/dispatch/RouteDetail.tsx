import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { X, MapPin, Clock, Truck, Play } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { routesApi, type Route, type RouteStop, type Agent, type OptimizeResult } from '../../lib/api'

interface Props {
  routeOrResult: Route | OptimizeResult
  agents: Agent[]
  onClose: () => void
  onActivate: (routeId: string, agentId: string) => void
  activating: boolean
}

function isOptimizeResult(r: Route | OptimizeResult): r is OptimizeResult {
  return 'routeId' in r
}

export function RouteDetail({ routeOrResult, agents, onClose, onActivate, activating }: Props) {
  const { getToken } = useAuth()
  const [selectedAgentId, setSelectedAgentId] = useState('')

  const routeId = isOptimizeResult(routeOrResult) ? routeOrResult.routeId : routeOrResult.id
  const status = isOptimizeResult(routeOrResult) ? routeOrResult.status : routeOrResult.status

  // Fetch full route with stops when coming from route list
  const { data: routeData, isLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      const token = await getToken({template:"default"})
      return routesApi.get(token ?? '', routeId)
    },
    enabled: !isOptimizeResult(routeOrResult),
  })

  const stops: (RouteStop | OptimizeResult['stops'][0])[] = isOptimizeResult(routeOrResult)
    ? routeOrResult.stops
    : routeData?.stops ?? []

  const totalKm = isOptimizeResult(routeOrResult)
    ? routeOrResult.totalDistanceKm
    : routeOrResult.total_distance_km

  const durationMins = isOptimizeResult(routeOrResult)
    ? routeOrResult.estimatedDurationMins
    : routeOrResult.estimated_duration_mins

  const availableAgents = agents.filter((a) => a.status === 'available')

  function handleActivate() {
    const agentToUse = selectedAgentId || availableAgents[0]?.id
    if (agentToUse) onActivate(routeId, agentToUse)
  }

  return (
    <div
      className="animate-slide-in"
      style={{
        background: 'var(--void)',
        border: '1px solid var(--rim)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 160px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--rim)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--frost)',
              }}
            >
              {routeId.slice(-10).toUpperCase()}
            </span>
            <Badge status={status} />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <MetaChip icon={<MapPin size={11} />} label={`${stops.length} stops`} />
            <MetaChip icon={<Truck size={11} />} label={`${totalKm} km`} />
            <MetaChip icon={<Clock size={11} />} label={`~${durationMins} min`} />
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Activate bar (if planned) */}
      {status === 'planned' && (
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--rim)',
            background: 'rgba(200,255,87,0.04)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {availableAgents.length > 0 && (
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              style={{
                flex: 1,
                height: 36,
                background: 'var(--void)',
                border: '1px solid var(--rim)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--chalk)',
                fontSize: 13,
                padding: '0 10px',
                fontFamily: 'var(--font-body)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">
                {availableAgents[0]?.name ?? 'Pick agent'}
              </option>
              {availableAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleActivate}
            loading={activating}
            disabled={availableAgents.length === 0}
          >
            <Play size={12} />
            Activate
          </Button>
        </div>
      )}

      {/* Stop list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spinner />
          </div>
        ) : stops.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--frost)', padding: 20 }}>No stops yet.</p>
        ) : (
          <div>
            {stops.map((stop, idx) => {
              const isRS = 'status' in stop
              const customerName = isRS
                ? (stop as RouteStop).customer_name
                : (stop as OptimizeResult['stops'][0]).customerName
              const address = stop.address ?? ''
              const eta = stop.eta
              const dist = isRS
                ? (stop as RouteStop).distance_from_prev_km
                : (stop as OptimizeResult['stops'][0]).distanceFromPrevKm
              const stopStatus = isRS ? (stop as RouteStop).status : 'pending'
              const seqNo = isRS
                ? (stop as RouteStop).sequence_no
                : (stop as OptimizeResult['stops'][0]).sequenceNo

              return (
                <div
                  key={idx}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--rim)',
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Sequence number */}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background:
                        stopStatus === 'delivered'
                          ? 'var(--volt)'
                          : stopStatus === 'failed'
                            ? 'var(--signal)'
                            : 'var(--shell)',
                      border: `1px solid ${stopStatus === 'delivered' ? 'var(--volt)' : 'var(--rim)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        stopStatus === 'delivered'
                          ? 'var(--obsidian)'
                          : 'var(--frost)',
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {seqNo}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--chalk)' }}>
                        {customerName}
                      </p>
                      {isRS && <Badge status={stopStatus} />}
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--frost)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {address}
                    </p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      {eta && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color:
                              stopStatus === 'heading_to' ? 'var(--volt)' : 'var(--frost)',
                          }}
                        >
                          {formatEta(eta)}
                        </span>
                      )}
                      {dist > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {dist.toFixed(1)} km
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--frost)',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

function formatEta(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

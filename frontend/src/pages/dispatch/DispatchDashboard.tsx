import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { Map, Users, Package, Truck, Plus, ChevronRight, RotateCcw, Play } from 'lucide-react'
import { Shell } from '../../components/layout/Shell'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { agentsApi, routesApi, type Route, type Agent, type OptimizeResult } from '../../lib/api'
import { RouteOptimizeModal } from './RouteOptimizeModal'
import { RouteDetail } from './RouteDetail'

export function DispatchDashboard() {
  const { getToken } = useAuth()
  const qc = useQueryClient()

  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<OptimizeResult | Route | null>(null)

  const token = () => getToken({template:"default"})

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const t = await token()
      return agentsApi.list(t ?? '')
    },
    refetchInterval: 15_000,
  })

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['routes', 'today'],
    queryFn: async () => {
      const t = await token()
      const today = new Date().toISOString().slice(0, 10)
      return routesApi.list(t ?? '', { date: today })
    },
    refetchInterval: 15_000,
  })

  const agents = agentsData?.agents ?? []
  const routes = routesData?.routes ?? []

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeRoutes    = routes.filter((r) => r.status === 'active').length
  const plannedRoutes   = routes.filter((r) => r.status === 'planned').length
  const completedRoutes = routes.filter((r) => r.status === 'completed').length
  const availableAgents = agents.filter((a) => a.status === 'available').length
  const onRouteAgents   = agents.filter((a) => a.status === 'on_route').length

  // ── Activate route mutation ───────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: async ({ routeId, agentId }: { routeId: string; agentId: string }) => {
      const t = await token()
      return routesApi.activate(t ?? '', routeId, agentId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      qc.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Shell
      title="Dispatch"
      actions={
        <Button variant="primary" size="sm" onClick={() => setOptimizeOpen(true)}>
          <Plus size={14} /> Optimize Route
        </Button>
      }
    >
      {/* ── Header greeting ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 12, color: 'var(--frost)', marginBottom: 4 }}>
          {today}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--chalk)',
          }}
        >
          Operations Overview
        </h2>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}
      >
        <StatCard
          label="Active Routes"
          value={activeRoutes}
          icon={<Map size={16} />}
          animationDelay={0}
          delta={activeRoutes > 0 ? { value: `${onRouteAgents} agents out`, positive: true } : undefined}
        />
        <StatCard
          label="Planned"
          value={plannedRoutes}
          icon={<Package size={16} />}
          animationDelay={60}
        />
        <StatCard
          label="Completed Today"
          value={completedRoutes}
          icon={<Package size={16} />}
          animationDelay={120}
        />
        <StatCard
          label="Available Agents"
          value={availableAgents}
          icon={<Users size={16} />}
          animationDelay={180}
          delta={
            onRouteAgents > 0
              ? { value: `${onRouteAgents} on route`, positive: true }
              : undefined
          }
        />
      </div>

      {/* ── Body: Routes + Agents side by side ───────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedRoute ? '1fr 400px' : '1fr 280px',
          gap: 24,
          alignItems: 'start',
          transition: 'grid-template-columns var(--dur-base) var(--ease-out)',
        }}
      >
        {/* Routes list */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--chalk)', fontFamily: 'var(--font-heading)' }}>
              Today's Routes
            </h3>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['routes'] })}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--frost)',
                cursor: 'pointer',
                display: 'flex',
                padding: 4,
                borderRadius: 4,
              }}
              title="Refresh"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {routesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
              <Spinner />
            </div>
          ) : routes.length === 0 ? (
            <EmptyState
              icon={<Map size={32} />}
              message="No routes for today. Optimize a route to get started."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {routes.map((route) => (
                <RouteRow
                  key={route.id}
                  route={route}
                  agents={agents}
                  selected={
                    selectedRoute !== null &&
                    'routeId' in selectedRoute
                      ? selectedRoute.routeId === route.id
                      : (selectedRoute as Route | null)?.id === route.id
                  }
                  onSelect={() => setSelectedRoute(route)}
                  onActivate={(agentId) =>
                    activateMutation.mutate({ routeId: route.id, agentId })
                  }
                  activating={activateMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right panel: Route detail OR Agents list */}
        {selectedRoute ? (
          <RouteDetail
            routeOrResult={selectedRoute}
            agents={agents}
            onClose={() => setSelectedRoute(null)}
            onActivate={(routeId, agentId) =>
              activateMutation.mutate({ routeId, agentId })
            }
            activating={activateMutation.isPending}
          />
        ) : (
          <AgentsPanel agents={agents} loading={agentsLoading} />
        )}
      </div>

      {/* Optimize modal */}
      {optimizeOpen && (
        <RouteOptimizeModal
          agents={agents.filter((a) => a.status === 'available')}
          onClose={() => setOptimizeOpen(false)}
          onSuccess={(result) => {
            setOptimizeOpen(false)
            setSelectedRoute(result)
            qc.invalidateQueries({ queryKey: ['routes'] })
          }}
        />
      )}
    </Shell>
  )
}

// ── Route Row ─────────────────────────────────────────────────────────────────

function RouteRow({
  route,
  agents,
  selected,
  onSelect,
  onActivate,
  activating,
}: {
  route: Route
  agents: Agent[]
  selected: boolean
  onSelect: () => void
  onActivate: (agentId: string) => void
  activating: boolean
}) {
  const agent = agents.find((a) => a.id === route.agent_id)

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(200,255,87,0.06)' : 'var(--void)',
        border: `1px solid ${selected ? 'var(--volt)' : 'var(--rim)'}`,
        borderRadius: 'var(--r-md)',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all var(--dur-fast) var(--ease-out)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--shell)'
          e.currentTarget.style.borderColor = 'rgba(238,238,245,0.15)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--void)'
          e.currentTarget.style.borderColor = 'var(--rim)'
        }
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
            {route.id.slice(-8).toUpperCase()}
          </span>
          <Badge status={route.status} />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Metric label="Stops" value={route.optimized_sequence?.length ?? '—'} />
          <Metric label="Distance" value={`${route.total_distance_km} km`} />
          <Metric label="Est." value={`${route.estimated_duration_mins} min`} />
        </div>
        {agent && (
          <p style={{ fontSize: 12, color: 'var(--frost)', marginTop: 6 }}>
            <Truck size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            {agent.name}
          </p>
        )}
      </div>

      {route.status === 'planned' && !route.agent_id && (
        <Button
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            // Auto-assign first available agent
            const available = agents.find((a) => a.status === 'available')
            if (available) onActivate(available.id)
          }}
          loading={activating}
          title="Activate with first available agent"
        >
          <Play size={12} />
        </Button>
      )}

      <ChevronRight size={16} color="var(--muted)" />
    </div>
  )
}

// ── Agents Panel ──────────────────────────────────────────────────────────────

function AgentsPanel({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  return (
    <section>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--chalk)',
          fontFamily: 'var(--font-heading)',
          marginBottom: 16,
        }}
      >
        Agents
      </h3>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
          <Spinner />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState icon={<Users size={28} />} message="No agents registered" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                background: 'var(--void)',
                border: '1px solid var(--rim)',
                borderRadius: 'var(--r-md)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--shell)',
                  border: '1px solid var(--rim)',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {agent.photo_url ? (
                  <img src={agent.photo_url} width={32} height={32} alt="" style={{ display: 'block' }} />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--frost)', fontWeight: 600 }}>
                    {agent.name[0]}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--chalk)' }}>
                  {agent.name}
                </p>
                <p style={{ fontSize: 11, color: 'var(--frost)' }}>{agent.vehicle_type}</p>
              </div>
              <Badge status={agent.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--frost)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--chalk)',
          marginTop: 1,
        }}
      >
        {value}
      </p>
    </div>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        color: 'var(--muted)',
        gap: 12,
        textAlign: 'center',
      }}
    >
      {icon}
      <p style={{ fontSize: 13, color: 'var(--frost)' }}>{message}</p>
    </div>
  )
}

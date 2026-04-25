import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { X, Zap } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { routesApi, hubsApi, type Agent, type OptimizeResult } from '../../lib/api'

interface Props {
  agents: Agent[]
  onClose: () => void
  onSuccess: (result: OptimizeResult) => void
}

export function RouteOptimizeModal({ agents, onClose, onSuccess }: Props) {
  const { getToken } = useAuth()

  const [hubId, setHubId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [agentId, setAgentId] = useState('')

  const { data: hubsData } = useQuery({
    queryKey: ['hubs'],
    queryFn: async () => {
      const token = await getToken({ template: 'default' })
      return hubsApi.list(token ?? '')
    },
  })
  const hubs = hubsData?.hubs ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken({template:"default"})
      return routesApi.optimize(token ?? '', {
        hubId: hubId.trim(),
        date,
        agentId: agentId || undefined,
      })
    },
    onSuccess,
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(12,12,15,0.8)',
          zIndex: 40,
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        className="animate-fade-up"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-lg)',
          padding: 28,
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--chalk)',
              }}
            >
              Optimize Route
            </h2>
            <p style={{ fontSize: 12, color: 'var(--frost)', marginTop: 2 }}>
              Nearest-neighbour TSP on pending orders
            </p>
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
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--frost)',
              }}
            >
              Hub
            </label>
            <select
              value={hubId}
              onChange={(e) => setHubId(e.target.value)}
              style={{
                height: 40,
                background: 'var(--void)',
                border: '1px solid var(--rim)',
                borderRadius: 'var(--r-sm)',
                color: hubId ? 'var(--chalk)' : 'var(--muted)',
                fontSize: 14,
                padding: '0 12px',
                outline: 'none',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'var(--font-body)',
              }}
            >
              <option value="">— Select hub —</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Delivery Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--frost)',
              }}
            >
              Assign Agent (optional)
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={{
                height: 40,
                background: 'var(--void)',
                border: '1px solid var(--rim)',
                borderRadius: 'var(--r-sm)',
                color: agentId ? 'var(--chalk)' : 'var(--muted)',
                fontSize: 14,
                padding: '0 12px',
                outline: 'none',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'var(--font-body)',
              }}
            >
              <option value="">— Auto assign later —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.vehicle_type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {mutation.isError && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              background: 'rgba(255,92,40,0.10)',
              border: '1px solid var(--signal)',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              color: 'var(--signal)',
            }}
          >
            {(mutation.error as Error).message}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!hubId.trim() || !date}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Zap size={14} />
            Run Optimizer
          </Button>
        </div>
      </div>
    </>
  )
}

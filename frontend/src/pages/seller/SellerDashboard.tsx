import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { Package, PackageCheck, PackageX, Truck, Plus, Upload, X } from 'lucide-react'
import { Shell } from '../../components/layout/Shell'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { Input } from '../../components/ui/Input'
import { ordersApi, type Order, type CreateOrderPayload } from '../../lib/api'

export function SellerDashboard() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      const token = await getToken({template:"default"})
      return ordersApi.list(token ?? '', statusFilter ? { status: statusFilter } : undefined)
    },
    refetchInterval: 30_000,
  })

  const orders = data?.orders ?? []

  const createMutation = useMutation({
    mutationFn: async (payload: CreateOrderPayload) => {
      const token = await getToken({ template: 'default' })
      return ordersApi.create(token ?? '', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setCreateOpen(false)
    },
  })

  const placed      = orders.filter((o) => o.status === 'placed').length
  const inTransit   = orders.filter((o) => ['out_for_delivery','in_transit'].includes(o.status)).length
  const delivered   = orders.filter((o) => o.status === 'delivered').length
  const failed      = orders.filter((o) => o.status === 'failed').length

  const STATUS_FILTERS = [
    { label: 'All', value: '' },
    { label: 'Placed', value: 'placed' },
    { label: 'Out for Delivery', value: 'out_for_delivery' },
    { label: 'In Transit', value: 'in_transit' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Failed', value: 'failed' },
  ]

  return (
    <Shell
      title="Orders"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" disabled>
            <Upload size={13} /> Bulk Upload
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> New Order
          </Button>
        </div>
      }
    >
      {createOpen ? (
        <CreateOrderModal
          onClose={() => {
            if (!createMutation.isPending) setCreateOpen(false)
          }}
          onSubmit={(payload) => createMutation.mutate(payload)}
          isSubmitting={createMutation.isPending}
          error={createMutation.error instanceof Error ? createMutation.error.message : undefined}
        />
      ) : null}

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 14,
          marginBottom: 32,
        }}
      >
        <StatCard label="Pending" value={placed} icon={<Package size={16} />} animationDelay={0} />
        <StatCard label="In Transit" value={inTransit} icon={<Truck size={16} />} animationDelay={60} />
        <StatCard label="Delivered" value={delivered} icon={<PackageCheck size={16} />} animationDelay={120}
          delta={delivered > 0 ? { value: 'today', positive: true } : undefined} />
        <StatCard label="Failed" value={failed} icon={<PackageX size={16} />} animationDelay={180} />
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--r-full)',
              fontSize: 12,
              fontWeight: 500,
              border: `1px solid ${statusFilter === f.value ? 'var(--volt)' : 'var(--rim)'}`,
              background: statusFilter === f.value ? 'rgba(200,255,87,0.12)' : 'transparent',
              color: statusFilter === f.value ? 'var(--volt)' : 'var(--frost)',
              cursor: 'pointer',
              transition: 'all var(--dur-fast) var(--ease-out)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div
        style={{
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr 1fr',
            padding: '0 16px',
            height: 36,
            alignItems: 'center',
            borderBottom: '1px solid var(--rim)',
            background: 'var(--obsidian)',
          }}
        >
          {['Order ID', 'Customer', 'Status', 'Parcel', 'Window', 'Date'].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--frost)',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner />
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              gap: 12,
            }}
          >
            <Package size={32} color="var(--muted)" />
            <p style={{ fontSize: 13, color: 'var(--frost)' }}>
              {statusFilter ? `No ${statusFilter} orders` : 'No orders yet. Create your first.'}
            </p>
          </div>
        ) : (
          orders.map((order) => <OrderRow key={order.id} order={order} />)
        )}
      </div>
    </Shell>
  )
}

function CreateOrderModal({
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  onClose: () => void
  onSubmit: (payload: CreateOrderPayload) => void
  isSubmitting: boolean
  error?: string
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  function formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  function applyWindowPreset(startHour: number, endHour: number) {
    const start = new Date(tomorrow)
    start.setHours(startHour, 0, 0, 0)
    const end = new Date(tomorrow)
    end.setHours(endHour, 0, 0, 0)

    setForm((cur) => ({
      ...cur,
      deliveryWindowStart: formatDateTimeLocal(start),
      deliveryWindowEnd: formatDateTimeLocal(end),
    }))
  }

  const [form, setForm] = useState<CreateOrderPayload>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    address: '',
    hubId: 'hub_demo01',
    parcelWeight: 1,
    parcelSize: 'small',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    notes: '',
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(12,12,15,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--void)',
          border: '1px solid var(--rim)',
          borderRadius: 'var(--r-md)',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, color: 'var(--chalk)', fontFamily: 'var(--font-heading)' }}>
              Create Order
            </h3>
            <p style={{ fontSize: 12, color: 'var(--frost)', marginTop: 4 }}>
              This writes directly to the orders domain and returns a fare quote.
            </p>
          </div>
          <Button variant="icon" onClick={onClose} disabled={isSubmitting}>
            <X size={16} />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit({
              ...form,
              customerEmail: form.customerEmail || undefined,
              customerPhone: form.customerPhone || undefined,
              deliveryWindowStart: form.deliveryWindowStart || undefined,
              deliveryWindowEnd: form.deliveryWindowEnd || undefined,
              notes: form.notes || undefined,
            })
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <Input
              label="Customer Name"
              value={form.customerName}
              onChange={(e) => setForm((cur) => ({ ...cur, customerName: e.target.value }))}
              required
            />
            <Input
              label="Phone"
              value={form.customerPhone}
              onChange={(e) => setForm((cur) => ({ ...cur, customerPhone: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm((cur) => ({ ...cur, customerEmail: e.target.value }))}
            />
            <Input
              label="Hub ID"
              value={form.hubId}
              onChange={(e) => setForm((cur) => ({ ...cur, hubId: e.target.value }))}
              required
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input
                label="Address"
                value={form.address}
                onChange={(e) => setForm((cur) => ({ ...cur, address: e.target.value }))}
                required
              />
            </div>
            <Input
              label="Parcel Weight (kg)"
              type="number"
              min="0.1"
              step="0.1"
              value={String(form.parcelWeight)}
              onChange={(e) =>
                setForm((cur) => ({ ...cur, parcelWeight: Number(e.target.value || 0) }))
              }
              required
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
                Parcel Size
              </label>
              <select
                value={form.parcelSize}
                onChange={(e) =>
                  setForm((cur) => ({
                    ...cur,
                    parcelSize: e.target.value as CreateOrderPayload['parcelSize'],
                  }))
                }
                style={{
                  height: 40,
                  background: 'var(--void)',
                  border: '1px solid var(--rim)',
                  borderRadius: 'var(--r-sm)',
                  color: 'var(--chalk)',
                  fontSize: 14,
                  padding: '0 12px',
                }}
              >
                <option value="small">small</option>
                <option value="medium">medium</option>
                <option value="large">large</option>
              </select>
            </div>
            <Input
              label="Window Start"
              type="datetime-local"
              value={form.deliveryWindowStart}
              onChange={(e) => setForm((cur) => ({ ...cur, deliveryWindowStart: e.target.value }))}
            />
            <Input
              label="Window End"
              type="datetime-local"
              value={form.deliveryWindowEnd}
              onChange={(e) => setForm((cur) => ({ ...cur, deliveryWindowEnd: e.target.value }))}
            />
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" size="sm" onClick={() => applyWindowPreset(9, 12)}>
                Tomorrow 9-12
              </Button>
              <Button type="button" size="sm" onClick={() => applyWindowPreset(12, 15)}>
                Tomorrow 12-3
              </Button>
              <Button type="button" size="sm" onClick={() => applyWindowPreset(15, 18)}>
                Tomorrow 3-6
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setForm((cur) => ({
                    ...cur,
                    deliveryWindowStart: '',
                    deliveryWindowEnd: '',
                  }))
                }
              >
                Clear Window
              </Button>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm((cur) => ({ ...cur, notes: e.target.value }))}
              />
            </div>
          </div>

          {error ? (
            <p style={{ marginTop: 14, color: 'var(--signal)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Create Order
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function OrderRow({ order }: { order: Order }) {
  const window = order.delivery_window_start
    ? `${fmt(order.delivery_window_start)} – ${fmt(order.delivery_window_end ?? '')}`
    : '—'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr 1fr',
        padding: '0 16px',
        height: 52,
        alignItems: 'center',
        borderBottom: '1px solid var(--rim)',
        transition: 'background var(--dur-fast)',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--shell)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--frost)',
        }}
      >
        {order.id.slice(-10).toUpperCase()}
      </span>

      <div>
        <p style={{ fontSize: 13, color: 'var(--chalk)', fontWeight: 500 }}>
          {order.customer_name}
        </p>
        <p
          style={{
            fontSize: 11,
            color: 'var(--frost)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.address}
        </p>
      </div>

      <Badge status={order.status} />

      <span style={{ fontSize: 13, color: 'var(--chalk)' }}>
        {order.parcel_weight}kg · {order.parcel_size}
      </span>

      <span style={{ fontSize: 11, color: 'var(--frost)', fontFamily: 'var(--font-mono)' }}>
        {window}
      </span>

      <span style={{ fontSize: 11, color: 'var(--frost)', fontFamily: 'var(--font-mono)' }}>
        {fmt(order.created_at)}
      </span>
    </div>
  )
}

function fmt(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

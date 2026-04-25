import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { Package, PackageCheck, PackageX, Truck, Plus, Upload } from 'lucide-react'
import { Shell } from '../../components/layout/Shell'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { ordersApi, type Order } from '../../lib/api'

export function SellerDashboard() {
  const { getToken } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      const token = await getToken({template:"default"})
      return ordersApi.list(token ?? '', statusFilter ? { status: statusFilter } : undefined)
    },
    refetchInterval: 30_000,
  })

  const orders = data?.orders ?? []

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
          <Button variant="ghost" size="sm">
            <Upload size={13} /> Bulk Upload
          </Button>
          <Button variant="primary" size="sm">
            <Plus size={13} /> New Order
          </Button>
        </div>
      }
    >
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

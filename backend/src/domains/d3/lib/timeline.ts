import type { DeliveryEventRow, TimelineMilestone } from '../types'

// ── Status display order ──────────────────────────────────────────────────────

const STATUS_ORDER = [
  'placed',
  'confirmed',
  'packed',
  'out_for_delivery',
  'in_transit',
  'delivered',
] as const

const STATUS_LABELS: Record<string, string> = {
  placed: 'Order Placed',
  confirmed: 'Order Confirmed',
  packed: 'Packed at Warehouse',
  out_for_delivery: 'Out for Delivery',
  in_transit: 'Agent En Route',
  delivered: 'Delivered',
  failed: 'Delivery Attempted',
  rescheduled: 'Rescheduled',
}

/**
 * Build a milestone timeline from a raw event log.
 *
 * Extracts `order.status_changed` events in chronological order and maps each
 * `to` status to a milestone. The current order status determines which
 * milestones are marked `done`.
 */
export function buildTimeline(
  events: DeliveryEventRow[],
  currentStatus?: string,
): TimelineMilestone[] {
  // Collect status transitions in ascending time order
  const transitions = events
    .filter((e) => e.event_type === 'order.status_changed')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  // Map status → first timestamp it was reached
  const reachedAt = new Map<string, string>()
  for (const ev of transitions) {
    try {
      const meta = JSON.parse(ev.metadata) as { to?: string }
      if (meta.to && !reachedAt.has(meta.to)) {
        reachedAt.set(meta.to, ev.created_at)
      }
    } catch {
      // malformed metadata — skip
    }
  }

  // Derive current status from last transition if not supplied
  const lastTransition = transitions[transitions.length - 1]
  let activeStatus = currentStatus
  if (!activeStatus && lastTransition) {
    try {
      const meta = JSON.parse(lastTransition.metadata) as { to?: string }
      activeStatus = meta.to
    } catch {
      // ignore
    }
  }

  const currentIdx = activeStatus ? STATUS_ORDER.indexOf(activeStatus as (typeof STATUS_ORDER)[number]) : -1

  // Build milestone array in display order
  const milestones: TimelineMilestone[] = STATUS_ORDER.map((status, idx) => ({
    status,
    label: STATUS_LABELS[status] ?? status,
    at: reachedAt.get(status) ?? null,
    done: idx < currentIdx,
  }))

  // Handle terminal states that fall outside STATUS_ORDER
  if (activeStatus === 'failed' || activeStatus === 'rescheduled') {
    milestones.push({
      status: activeStatus,
      label: STATUS_LABELS[activeStatus] ?? activeStatus,
      at: reachedAt.get(activeStatus) ?? null,
      done: false,
    })
  }

  return milestones
}

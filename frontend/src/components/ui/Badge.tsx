import type { CSSProperties } from 'react'

type BadgeVariant =
  | 'delivered'
  | 'in_transit'
  | 'out_for_delivery'
  | 'packed'
  | 'confirmed'
  | 'placed'
  | 'failed'
  | 'rescheduled'
  | 'available'
  | 'on_route'
  | 'offline'
  | 'active'
  | 'planned'
  | 'completed'
  | 'pending'

const VARIANT_CONFIG: Record<
  BadgeVariant,
  { bg: string; dot: string; text: string; pulse?: boolean }
> = {
  delivered:       { bg: 'rgba(200,255,87,0.12)',  dot: '#c8ff57', text: '#c8ff57' },
  in_transit:      { bg: 'rgba(87,200,255,0.12)',  dot: '#57c8ff', text: '#57c8ff', pulse: true },
  out_for_delivery:{ bg: 'rgba(255,176,32,0.12)',  dot: '#ffb020', text: '#ffb020' },
  packed:          { bg: 'rgba(255,176,32,0.12)',  dot: '#ffb020', text: '#ffb020' },
  confirmed:       { bg: 'rgba(238,238,245,0.08)', dot: '#eeeef5', text: '#eeeef5' },
  placed:          { bg: 'rgba(168,168,190,0.10)', dot: '#a8a8be', text: '#a8a8be' },
  failed:          { bg: 'rgba(255,92,40,0.12)',   dot: '#ff5c28', text: '#ff5c28' },
  rescheduled:     { bg: 'rgba(42,42,54,0.80)',    dot: '#6b6b80', text: '#a8a8be' },
  available:       { bg: 'rgba(200,255,87,0.12)',  dot: '#c8ff57', text: '#c8ff57' },
  on_route:        { bg: 'rgba(87,200,255,0.12)',  dot: '#57c8ff', text: '#57c8ff', pulse: true },
  offline:         { bg: 'rgba(42,42,54,0.80)',    dot: '#6b6b80', text: '#a8a8be' },
  active:          { bg: 'rgba(87,200,255,0.12)',  dot: '#57c8ff', text: '#57c8ff', pulse: true },
  planned:         { bg: 'rgba(255,176,32,0.12)',  dot: '#ffb020', text: '#ffb020' },
  completed:       { bg: 'rgba(200,255,87,0.12)',  dot: '#c8ff57', text: '#c8ff57' },
  pending:         { bg: 'rgba(255,176,32,0.12)',  dot: '#ffb020', text: '#ffb020' },
}

const LABEL_MAP: Partial<Record<BadgeVariant, string>> = {
  out_for_delivery: 'Out for Del.',
  in_transit:       'In Transit',
  on_route:         'On Route',
}

interface BadgeProps {
  status: BadgeVariant | string
}

export function Badge({ status }: BadgeProps) {
  const variant = status as BadgeVariant
  const label = LABEL_MAP[variant] ?? status.replace(/_/g, ' ')
  const config = VARIANT_CONFIG[variant] ?? {
    bg: 'rgba(42,42,54,0.80)',
    dot: '#6b6b80',
    text: '#a8a8be',
  }

  const containerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '2px 8px',
    minWidth: 96,
    maxWidth: '100%',
    borderRadius: 9999,
    background: config.bg,
    fontSize: 10,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: config.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'var(--font-body)',
  }

  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: config.dot,
    flexShrink: 0,
    animation: config.pulse ? 'live-pulse 1.4s ease-in-out infinite' : undefined,
  }

  return (
    <span style={containerStyle} title={label}>
      <span style={dotStyle} />
      {label}
    </span>
  )
}

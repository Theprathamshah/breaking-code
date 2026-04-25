import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  delta?: { value: string; positive: boolean }
  icon?: ReactNode
  animationDelay?: number
}

export function StatCard({ label, value, delta, icon, animationDelay = 0 }: StatCardProps) {
  return (
    <div
      className="animate-fade-up"
      style={{
        background: 'var(--void)',
        border: '1px solid var(--rim)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--sp-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animationDelay: `${animationDelay}ms`,
        animationFillMode: 'both',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--frost)',
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: 'var(--frost)' }}>{icon}</span>}
      </div>

      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 40,
          fontWeight: 700,
          color: 'var(--chalk)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>

      {delta && (
        <span
          style={{
            fontSize: 12,
            color: delta.positive ? 'var(--volt)' : 'var(--signal)',
          }}
        >
          {delta.positive ? '↑' : '↓'} {delta.value}
        </span>
      )}
    </div>
  )
}

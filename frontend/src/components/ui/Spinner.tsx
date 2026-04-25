interface SpinnerProps {
  size?: number
  color?: string
}

export function Spinner({ size = 20, color = 'var(--volt)' }: SpinnerProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--obsidian)',
      }}
    >
      <Spinner size={32} />
    </div>
  )
}

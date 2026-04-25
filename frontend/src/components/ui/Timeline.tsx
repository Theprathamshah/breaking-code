type TimelineStep = {
  status: string
  label: string
  ts?: string
  done: boolean
  current: boolean
}

interface TimelineProps {
  steps: TimelineStep[]
}

export function Timeline({ steps }: TimelineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const color = step.done
          ? 'var(--volt)'
          : step.current
            ? 'var(--amber)'
            : 'var(--rim)'

        return (
          <div key={step.status} style={{ display: 'flex', gap: 16 }}>
            {/* connector column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: step.done || step.current ? color : 'transparent',
                  border: `2px solid ${color}`,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              {!isLast && (
                <div
                  style={{
                    width: 1,
                    flex: 1,
                    minHeight: 24,
                    borderLeft: `1px dashed var(--rim)`,
                  }}
                />
              )}
            </div>

            {/* content */}
            <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1 }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: step.current ? 500 : 400,
                  color: step.done || step.current ? 'var(--chalk)' : 'var(--muted)',
                  lineHeight: '18px',
                }}
              >
                {step.label}
              </p>
              {step.ts && (
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--frost)',
                    marginTop: 2,
                  }}
                >
                  {formatTs(step.ts)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatTs(ts: string): string {
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

import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, id, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--frost)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          height: 40,
          background: 'var(--void)',
          border: `1px solid ${error ? 'var(--signal)' : 'var(--rim)'}`,
          borderRadius: 'var(--r-sm)',
          color: 'var(--chalk)',
          fontSize: 14,
          padding: '0 12px',
          outline: 'none',
          transition: 'border-color var(--dur-fast) var(--ease-out)',
          width: '100%',
          fontFamily: 'var(--font-body)',
          ...style,
        }}
        onFocus={(e) => {
          if (!error) e.currentTarget.style.borderColor = 'var(--volt)'
        }}
        onBlur={(e) => {
          if (!error) e.currentTarget.style.borderColor = 'var(--rim)'
        }}
        {...props}
      />
      {error && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--signal)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'icon'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: `
    background: var(--volt);
    color: var(--obsidian);
    border: none;
    font-weight: 600;
  `,
  ghost: `
    background: transparent;
    color: var(--chalk);
    border: 1px solid var(--rim);
  `,
  danger: `
    background: rgba(255,92,40,0.12);
    color: var(--signal);
    border: 1px solid var(--signal);
  `,
  icon: `
    background: transparent;
    color: var(--frost);
    border: none;
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'height: 32px; padding: 0 12px; font-size: 13px;',
  md: 'height: 40px; padding: 0 16px; font-size: 14px;',
  lg: 'height: 48px; padding: 0 24px; font-size: 15px;',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  children,
  loading,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      style={{
        // Base
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--font-body)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: `
          background var(--dur-fast) var(--ease-out),
          transform var(--dur-instant) var(--ease-snap),
          opacity var(--dur-fast) var(--ease-out)
        `,
        outline: 'none',
        whiteSpace: 'nowrap',
        ...parseCssString(VARIANT_STYLES[variant]),
        ...parseCssString(SIZE_STYLES[size]),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--volt-dim)'
        else if (variant === 'ghost') el.style.background = 'var(--shell)'
        else if (variant === 'danger') el.style.background = 'rgba(255,92,40,0.20)'
        else if (variant === 'icon') el.style.background = 'var(--shell)'
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--volt)'
        else if (variant === 'ghost') el.style.background = 'transparent'
        else if (variant === 'danger') el.style.background = 'rgba(255,92,40,0.12)'
        else if (variant === 'icon') el.style.background = 'transparent'
      }}
      onMouseDown={(e) => {
        if (!isDisabled) e.currentTarget.style.transform = 'scale(0.97)'
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: 14,
            height: 14,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : null}
      {children}
    </button>
  )
}

/** Parse a CSS-in-JS string (from template literals) into a style object. */
function parseCssString(css: string): React.CSSProperties {
  const obj: Record<string, string> = {}
  css
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((decl) => {
      const colon = decl.indexOf(':')
      if (colon === -1) return
      const prop = decl.slice(0, colon).trim()
      const value = decl.slice(colon + 1).trim()
      // Convert kebab-case to camelCase
      const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      obj[camel] = value
    })
  return obj as React.CSSProperties
}

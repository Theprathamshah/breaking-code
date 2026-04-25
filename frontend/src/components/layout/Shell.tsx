import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useClerk, useUser } from '@clerk/clerk-react'
import {
  Truck,
  Package,
  Map,
  Users,
  IndianRupee,
  LogOut,
  ChevronDown,
} from 'lucide-react'

interface NavItem {
  to: string
  icon: ReactNode
  label: string
}

const NAV: NavItem[] = [
  { to: '/dispatch', icon: <Map size={16} />,         label: 'Dispatch' },
  { to: '/seller',   icon: <Package size={16} />,     label: 'Orders' },
  { to: '/agent',    icon: <Truck size={16} />,       label: 'Agent View' },
  { to: '/billing',  icon: <IndianRupee size={16} />, label: 'Billing' },
  { to: '/agents',   icon: <Users size={16} />,       label: 'Agents' },
]

interface ShellProps {
  children: ReactNode
  title?: string
  actions?: ReactNode
}

export function Shell({ children, title, actions }: ShellProps) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--obsidian)',
      }}
    >
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--void)',
          borderRight: '1px solid var(--rim)',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderBottom: '1px solid var(--rim)',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: 'var(--volt)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Truck size={15} color="#0c0c0f" />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--chalk)',
              letterSpacing: '-0.02em',
            }}
          >
            LastMile
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? 'var(--obsidian)' : 'var(--frost)',
                background: isActive ? 'var(--volt)' : 'transparent',
                transition: 'all var(--dur-fast) var(--ease-out)',
                textDecoration: 'none',
              })}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                if (!el.classList.contains('active')) {
                  el.style.background = 'var(--shell)'
                  el.style.color = 'var(--chalk)'
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                if (!el.classList.contains('active')) {
                  el.style.background = 'transparent'
                  el.style.color = 'var(--frost)'
                }
              }}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div
          style={{
            borderTop: '1px solid var(--rim)',
            padding: '12px 8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast)',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--shell)',
                border: '1px solid var(--rim)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {user?.imageUrl && (
                <img src={user.imageUrl} width={28} height={28} alt="" style={{ display: 'block' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--chalk)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.firstName ?? 'User'}
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
                {(user?.publicMetadata?.role as string) ?? 'dispatcher'}
              </p>
            </div>
            <button
              onClick={() => signOut(() => navigate('/login'))}
              title="Sign out"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                padding: 4,
                borderRadius: 4,
                transition: 'color var(--dur-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--signal)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        {/* Topbar */}
        {(title || actions) && (
          <header
            style={{
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 32px',
              borderBottom: '1px solid var(--rim)',
              background: 'var(--void)',
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            {title && (
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--chalk)',
                }}
              >
                {title}
              </h1>
            )}
            {actions && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {actions}
              </div>
            )}
          </header>
        )}

        {/* Page body */}
        <main
          style={{
            flex: 1,
            padding: '32px',
            overflow: 'auto',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

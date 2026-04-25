import { SignIn } from '@clerk/clerk-react'
import { Truck } from 'lucide-react'

export function Login() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--obsidian)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            background: 'var(--volt)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Truck size={22} color="var(--obsidian)" />
        </div>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--chalk)',
              letterSpacing: '-0.02em',
            }}
          >
            LastMile
          </h1>
          <p style={{ fontSize: 12, color: 'var(--frost)' }}>Smart Delivery Platform</p>
        </div>
      </div>

      {/* Clerk sign-in */}
      <SignIn
        appearance={{
          variables: {
            colorBackground: '#111116',
            colorText: '#eeeef5',
            colorPrimary: '#c8ff57',
            colorInputBackground: '#111116',
            colorInputText: '#eeeef5',
            borderRadius: '4px',
            fontFamily: 'DM Sans, sans-serif',
          },
          elements: {
            card: {
              background: '#111116',
              border: '1px solid #2a2a36',
              boxShadow: 'none',
              borderRadius: '8px',
            },
            headerTitle: {
              color: '#eeeef5',
              fontFamily: 'Space Grotesk, sans-serif',
            },
            formButtonPrimary: {
              background: '#c8ff57',
              color: '#0c0c0f',
              fontWeight: '600',
            },
            footerActionLink: { color: '#c8ff57' },
          },
        }}
        routing="path"
        path="/login"
        signUpUrl="/login"
        fallbackRedirectUrl="/dispatch"
      />
    </div>
  )
}

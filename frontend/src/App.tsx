import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn, useAuth, useUser } from '@clerk/clerk-react'
import { Login } from './pages/Login'
import { DispatchDashboard } from './pages/dispatch/DispatchDashboard'
import { SellerDashboard } from './pages/seller/SellerDashboard'
import { AgentHome } from './pages/agent/AgentHome'
import { TrackingPage } from './pages/customer/TrackingPage'
import { API_BASE } from './env'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}

function HomeRedirect() {
  const { user, isLoaded } = useUser()
  const { getToken } = useAuth()
  const [fallbackRole, setFallbackRole] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return

    const metadataRole = String(user?.publicMetadata?.role ?? '')
    if (metadataRole) {
      setFallbackRole(metadataRole)
      return
    }

    let cancelled = false

    ;(async () => {
      const token = await getToken({ template: 'default' })
      if (!token) return

      const res = await fetch(`${API_BASE}/api/sellers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!cancelled && res.ok) {
        setFallbackRole('seller')
      } else if (!cancelled) {
        setFallbackRole('dispatcher')
      }
    })().catch(() => {
      if (!cancelled) setFallbackRole('dispatcher')
    })

    return () => {
      cancelled = true
    }
  }, [getToken, isLoaded, user?.publicMetadata?.role])

  if (!isLoaded || !fallbackRole) return null

  const role = fallbackRole

  if (role === 'seller') return <Navigate to="/seller" replace />
  if (role === 'agent') return <Navigate to="/agent" replace />
  return <Navigate to="/dispatch" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login/*" element={<Login />} />
      <Route path="/track/:token" element={<TrackingPage />} />

      {/* Protected */}
      <Route
        path="/dispatch"
        element={
          <ProtectedRoute>
            <DispatchDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/seller"
        element={
          <ProtectedRoute>
            <SellerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agent"
        element={
          <ProtectedRoute>
            <AgentHome />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

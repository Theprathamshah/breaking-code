import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import { Login } from './pages/Login'
import { DispatchDashboard } from './pages/dispatch/DispatchDashboard'
import { SellerDashboard } from './pages/seller/SellerDashboard'
import { AgentHome } from './pages/agent/AgentHome'
import { TrackingPage } from './pages/customer/TrackingPage'

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
      <Route path="/" element={<Navigate to="/dispatch" replace />} />
      <Route path="*" element={<Navigate to="/dispatch" replace />} />
    </Routes>
  )
}

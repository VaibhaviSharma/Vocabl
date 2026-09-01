import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export function LoadingScreen() {
  return <div className="loading-state">Loading…</div>
}

// Wraps routes that require a logged-in user (Home, Play, My Words, Quiz,
// Quiz Score). Bounces guests to /login.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Wraps guest-only routes (Welcome, Login/Signup). A returning user with a
// valid session skips straight past these to Home.
export function RequireGuest({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/home" replace />
  return children
}

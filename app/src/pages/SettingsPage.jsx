import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const name = user.user_metadata?.name

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <Link to="/home" className="back-link">
            ← Back
          </Link>
        </div>

        <div className="auth-logo">{name ? `Hi, ${name}` : 'Settings'}</div>

        <div className="category-choice">
          <Link to="/feedback" className="btn btn-secondary">
            💬 Give feedback
          </Link>
          <button type="button" className="btn btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
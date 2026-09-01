import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const MIN_PASSWORD_LENGTH = 8

// Reached via the link in the password-reset email. Supabase's client
// detects the recovery token in the URL and establishes a session
// automatically (detectSessionInUrl, on by default) before this mounts —
// updateUser() below just needs that session to exist, which is why the
// form doesn't gate on any special "recovery" state of its own.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    navigate('/home')
  }

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="auth-logo">Set a new password</div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="password"
            placeholder="New password"
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="text-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            Set password
          </button>
        </form>
      </div>
    </div>
  )
}

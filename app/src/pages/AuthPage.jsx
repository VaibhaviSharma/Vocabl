import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logEvent } from '../lib/userEvents'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export default function AuthPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  function switchMode(next) {
    setMode(next)
    setError(null)
    setResetSent(false)
  }

  function validate() {
    if (!EMAIL_RE.test(email)) return 'Enter a valid email address.'
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    if (mode === 'signup' && password !== confirmPassword) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    // No manual navigate('/home') here on success: AuthContext's user state
    // updates asynchronously (it awaits ensureProfile first), and RequireGuest
    // wrapping this route reacts to that and redirects on its own. Navigating
    // explicitly here raced ahead of that state update — RequireAuth would see
    // a still-null user for one render and bounce straight back to /login.
    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() ? name.trim() : null } },
      })
      if (signUpError) {
        setSubmitting(false)
        setError(signUpError.message)
        return
      }
      if (data.user) logEvent(data.user.id, 'signup')
    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setSubmitting(false)
        setError(signInError.message)
        return
      }
      if (data.user) logEvent(data.user.id, 'login')
    }
  }

  async function handleForgotPassword() {
    if (!EMAIL_RE.test(email)) {
      setError('Enter your email above first, then tap "Forgot password?"')
      return
    }
    setError(null)
    setSubmitting(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setResetSent(true)
  }

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="auth-logo">Vocabl</div>
        <p className="auth-tagline">Vocabulary app for CAT aspirants</p>

        <div className="filter-toggle">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Log In
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Name (optional)"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            className="text-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          {mode === 'signup' && (
            <input
              type="password"
              placeholder="Confirm password"
              className="text-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}

          {error && <p className="form-error">{error}</p>}
          {resetSent && <p className="form-success">Password reset email sent — check your inbox.</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {mode === 'signup' ? 'Sign Up' : 'Log In'}
          </button>

          {mode === 'login' && (
            <button type="button" className="text-link-button" onClick={handleForgotPassword} disabled={submitting}>
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

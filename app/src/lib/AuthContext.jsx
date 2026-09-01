import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(undefined)

// Idempotent: inserts a user_profiles row if one doesn't exist yet. Safe to
// call on every sign-in, not just the first one — a 23505 unique_violation
// (row already exists) is the expected case after the first call. name/email
// only ever land on the row via this first insert (a later 23505 no-ops
// instead of overwriting), which is fine — name is captured once at signup,
// not editable elsewhere yet.
async function ensureProfile(user) {
  const { error } = await supabase.from('user_profiles').insert({
    user_id: user.id,
    name: user.user_metadata?.name ?? null,
    email: user.email ?? null,
  })
  if (error && error.code !== '23505') {
    throw error
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) await ensureProfile(session.user)
      if (!cancelled) {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    }

    init()

    // Not `async` directly (Supabase warns against awaiting auth.* calls
    // inside this callback — can deadlock the listener). Ensuring the
    // profile row exists before setUser matters here: setUser is what lets
    // RequireAuth render protected pages, and those pages immediately query
    // user_profiles with .single() — if that query races ahead of this
    // insert on a brand-new signup, it 406s on the not-yet-existing row.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ensureProfile(session.user)
          .catch(() => {})
          .finally(() => setUser(session.user))
      } else {
        setUser(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

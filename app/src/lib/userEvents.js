import { supabase } from './supabaseClient'

// Fire-and-forget: never awaited by callers, so logging can't slow down or
// block the actual user action it's describing. Errors are swallowed (just
// logged to the console) rather than surfaced, since a failed analytics
// write should never disrupt gameplay.
export function logEvent(userId, eventType, eventData = {}) {
  supabase
    .from('user_events')
    .insert({ user_id: userId, event_type: eventType, event_data: eventData })
    .then(({ error }) => {
      if (error) console.error(`Failed to log event "${eventType}":`, error)
    })
}

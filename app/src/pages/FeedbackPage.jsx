import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { submitFeedback } from '../lib/feedback'
import { logEvent } from '../lib/userEvents'

const CATEGORIES = [
  { value: 'loved', label: 'Loved something' },
  { value: 'missing', label: "Something's missing" },
  { value: 'bug', label: 'Found a bug' },
  { value: 'other', label: 'Other' },
]

export default function FeedbackPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rating, setRating] = useState(0)
  const [category, setCategory] = useState(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const canSubmit = rating > 0 || category !== null || message.trim().length > 0

  async function handleSubmit() {
    setSubmitting(true)
    const payload = {
      rating: rating > 0 ? rating : null,
      category,
      message: message.trim() ? message.trim() : null,
    }
    try {
      await submitFeedback(user.id, payload)
      logEvent(user.id, 'feedback_submitted', { rating: payload.rating, category: payload.category })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="app-shell">
        <div className="page-card">
          <div className="word-card">
            <div className="reveal-panel">
              <p className="reveal-result won">Thanks — got it.</p>
              <div className="reveal-actions">
                <button type="button" className="btn btn-primary" onClick={() => navigate(-1)}>
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>

        <div className="auth-logo">How's it going?</div>
        <p className="auth-tagline">Tell us what's working, what's not, or anything in between — totally optional.</p>

        <div className="star-rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`star${n <= rating ? ' star-filled' : ''}`}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(n === rating ? 0 : n)}
            >
              ★
            </button>
          ))}
        </div>

        <div className="chip-group">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`chip category-chip${category === c.value ? ' active' : ''}`}
              onClick={() => setCategory(category === c.value ? null : c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <textarea
          className="text-input feedback-textarea"
          placeholder="Anything you want to add? (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />

        <button type="button" className="btn btn-primary" disabled={!canSubmit || submitting} onClick={handleSubmit}>
          Submit
        </button>
      </div>
    </div>
  )
}
import { Link } from 'react-router-dom'

const FORMATS = [
  { label: 'Contextual closest meaning', to: '/quiz' },
  { label: 'Confusing word pairs' },
  { label: 'Word usage errors' },
  { label: 'Odd word out' },
]

export default function PracticePage() {
  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <Link to="/home" className="back-link">
            ← Back
          </Link>
        </div>

        <div className="auth-logo">Practice</div>

        <div className="category-choice">
          {FORMATS.map((f) =>
            f.to ? (
              <Link key={f.label} to={f.to} className="btn btn-secondary">
                {f.label}
              </Link>
            ) : (
              <button key={f.label} type="button" className="btn btn-secondary" disabled>
                {f.label} — coming soon
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

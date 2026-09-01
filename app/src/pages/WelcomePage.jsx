import { useNavigate } from 'react-router-dom'

export default function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="welcome-page">
      <div className="welcome-logo">Vocabl</div>
      <p className="welcome-tagline">
        CAT vocabulary, minus the flashcards. Guess the word, keep the streak.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
        Start
      </button>
    </div>
  )
}

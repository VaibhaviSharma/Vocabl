import { Link } from 'react-router-dom'
import { colorForDomain } from '../lib/domainColors'

// Pure exposure — no guessing, no scoring, no pass/fail. Word and meaning
// show together immediately, no reveal step.
export default function Flashcard({ word, onNext, onBack, progress, isLast }) {
  const domainColor = colorForDomain(word.source_domain)

  return (
    <div className="word-card">
      <div className="word-card-top">
        {onBack && (
          <button type="button" className="back-link" aria-label="Exit session" onClick={onBack}>
            ✕
          </button>
        )}
        {progress && <span className="session-progress">{progress}</span>}
        <span className={`domain-tag card-color-${domainColor}`}>{word.source_domain}</span>
      </div>

      <div className="reveal-panel">
        <p className="reveal-word">{word.word}</p>
        <p className="reveal-definition">{word.correct_definition}</p>

        {word.etymology && (
          <>
            <span className="etymology-label">Origin</span>
            <p className="etymology-text">{word.etymology}</p>
          </>
        )}

        {word.root && (
          <Link to={`/family?root=${encodeURIComponent(word.root)}`} className="chip root-chip">
            {word.root} — {word.root_meaning}
            <span className="root-chip-arrow"> →</span>
          </Link>
        )}

        {word.example_sentence && <p className="reveal-example">“{word.example_sentence}”</p>}
        <div className="reveal-actions">
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {isLast ? 'Finish' : 'Next word'}
          </button>
        </div>
      </div>
    </div>
  )
}
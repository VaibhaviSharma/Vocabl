import { useEffect, useMemo, useRef, useState } from 'react'
import Keyboard from './Keyboard'
import { colorForDomain } from '../lib/domainColors'
import { maskWord } from '../lib/maskWord'

const MIN_ATTEMPTS_BONUS = 4

// Dynamic attempt count: higher tier (harder) words get more allowed wrong
// guesses. tier 1 -> 5 attempts, tier 5 -> 9 attempts.
export function computeMaxAttempts(tier) {
  return MIN_ATTEMPTS_BONUS + tier
}

function isWordSolved(word, guessedCorrect) {
  return [...word.toLowerCase()].every((ch) => !/[a-z]/.test(ch) || guessedCorrect.has(ch))
}

// Letter-blank sizing: never wraps to a second line (a broken word defeats
// the point of seeing its shape while guessing). Shrinks font/box size to
// fit long words on one line; if even the minimum shrink can't fit it
// (only the longest multi-word entries in the bank hit this), the row
// scrolls horizontally instead. USABLE_WIDTH is a conservative estimate of
// the row's available width on a narrow (~360px) phone, not the actual
// rendered width, since that would need a resize-observer for a case that
// only matters for a handful of outlier-length entries.
const DEFAULT_FONT_SIZE = 28
const DEFAULT_SLOT_WIDTH = 24
const DEFAULT_GAP = 8
const USABLE_WIDTH = 280
const MIN_SCALE = 0.5

export function computeBlankSizing(word) {
  const n = word.length
  const naturalWidth = n * (DEFAULT_SLOT_WIDTH + DEFAULT_GAP) - DEFAULT_GAP

  if (naturalWidth <= USABLE_WIDTH) {
    return { fontSize: DEFAULT_FONT_SIZE, slotWidth: DEFAULT_SLOT_WIDTH, gap: DEFAULT_GAP, needsScroll: false }
  }

  const unclampedScale = USABLE_WIDTH / naturalWidth
  const scale = Math.max(unclampedScale, MIN_SCALE)
  return {
    fontSize: DEFAULT_FONT_SIZE * scale,
    slotWidth: DEFAULT_SLOT_WIDTH * scale,
    gap: DEFAULT_GAP * scale,
    needsScroll: unclampedScale < MIN_SCALE,
  }
}

export default function HangmanRound({ word, onRoundComplete, onBack, onContinue, continueLabel, progress }) {
  const [guessedCorrect, setGuessedCorrect] = useState(new Set())
  const [guessedWrong, setGuessedWrong] = useState(new Set())
  const [gameState, setGameState] = useState('playing') // 'playing' | 'won' | 'lost'
  const completedRef = useRef(false)

  const maxAttempts = useMemo(() => computeMaxAttempts(word.tier), [word.tier])
  const blankSizing = useMemo(() => computeBlankSizing(word.word), [word.word])
  // In-round hint: the example sentence with the target word blanked out,
  // shown automatically for the whole round as context. Null if the word
  // isn't found verbatim in the sentence (older content, or a flagged row).
  const maskedSentence = useMemo(
    () => (word.example_sentence ? maskWord(word.example_sentence, word.word) : null),
    [word.id]
  )

  useEffect(() => {
    setGuessedCorrect(new Set())
    setGuessedWrong(new Set())
    setGameState('playing')
    completedRef.current = false
  }, [word.id])

  useEffect(() => {
    if (gameState === 'playing' || completedRef.current) return
    completedRef.current = true
    const usedMaxAttempts = guessedWrong.size >= Math.ceil(maxAttempts * 0.7)
    onRoundComplete({
      result: gameState === 'won' ? 'correct' : 'incorrect',
      usedMaxAttempts,
      attemptsUsed: guessedWrong.size,
    })
  }, [gameState, guessedWrong, maxAttempts, onRoundComplete])

  function handleGuess(letter) {
    if (gameState !== 'playing' || guessedCorrect.has(letter) || guessedWrong.has(letter)) return

    if (word.word.toLowerCase().includes(letter)) {
      const next = new Set(guessedCorrect)
      next.add(letter)
      setGuessedCorrect(next)
      if (isWordSolved(word.word, next)) setGameState('won')
    } else {
      const next = new Set(guessedWrong)
      next.add(letter)
      setGuessedWrong(next)
      if (next.size >= maxAttempts) setGameState('lost')
    }
  }

  const attemptsLeft = maxAttempts - guessedWrong.size
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

      {gameState === 'playing' ? (
        <>
          {maskedSentence && <p className="context-sentence">{maskedSentence}</p>}

          <div
            className={`word-blanks${blankSizing.needsScroll ? ' word-blanks-scroll' : ''}`}
            style={{ fontSize: `${blankSizing.fontSize}px`, gap: `${blankSizing.gap}px` }}
          >
            {[...word.word].map((ch, i) => {
              const lower = ch.toLowerCase()
              const isLetter = /[a-z]/.test(lower)
              return (
                <span className="letter-slot" style={{ minWidth: `${blankSizing.slotWidth}px` }} key={i}>
                  {!isLetter ? ch : guessedCorrect.has(lower) ? ch : ' '}
                </span>
              )
            })}
          </div>

          <div className="attempts-row">
            {Array.from({ length: maxAttempts }).map((_, i) => (
              <span
                key={i}
                className={`attempt-dot${i >= attemptsLeft ? ' attempt-dot-used' : ''}`}
              />
            ))}
          </div>

          <Keyboard guessedCorrect={guessedCorrect} guessedWrong={guessedWrong} onGuess={handleGuess} />
        </>
      ) : (
        <div className="reveal-panel">
          <p className={`reveal-result ${gameState === 'won' ? 'won' : 'lost'}`}>
            {gameState === 'won' ? 'Got it.' : 'Out of guesses.'}
          </p>
          <p className="reveal-word">{word.word}</p>
          <p className="reveal-definition">{word.correct_definition}</p>
          {word.example_sentence && <p className="reveal-example">“{word.example_sentence}”</p>}
          {onContinue && (
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={onContinue}>
                {continueLabel ?? 'Continue'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

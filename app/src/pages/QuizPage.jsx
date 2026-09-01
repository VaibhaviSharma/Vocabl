import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchWordStatuses, upsertWordStatus } from '../lib/wordStatus'
import { createQuizAttempt, saveQuizResults } from '../lib/quizAttempts'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'

function buildOptions(word) {
  const options = [
    { text: word.correct_definition, isCorrect: true },
    ...word.distractor_definitions.map((d) => ({ text: d, isCorrect: false })),
  ]
  return shuffle(options)
}

export default function QuizPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // 'category' | 'loading' | 'empty' | 'playing' | 'complete'
  const [step, setStep] = useState('category')
  const [category, setCategory] = useState(null)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState([])

  // A quiz attempt must save exactly once, whether the user finishes
  // naturally or navigates away mid-quiz — refs hold the latest values so
  // the unmount cleanup (which only ever runs once, on unmount) can read
  // current state instead of a stale closure from whenever the effect was
  // first registered.
  const resultsRef = useRef(results)
  const categoryRef = useRef(category)
  const quizStartedRef = useRef(false)
  const savedRef = useRef(false)

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  useEffect(() => {
    categoryRef.current = category
  }, [category])

  async function saveAttempt(totalWordsShown, exitedEarly) {
    if (savedRef.current) return
    savedRef.current = true
    const correctCount = resultsRef.current.filter((r) => r.result === 'correct').length
    try {
      const attemptId = await createQuizAttempt(user.id, categoryRef.current, totalWordsShown)
      await saveQuizResults(attemptId, resultsRef.current)
    } catch (err) {
      console.error('Failed to save quiz attempt:', err)
    }
    logEvent(user.id, 'quiz_completed', {
      category: categoryRef.current,
      total_words_shown: totalWordsShown,
      score: correctCount,
      exited_early: exitedEarly,
    })
  }

  // Covers the user leaving the quiz mid-session (back button, navigating
  // to another screen). Only fires if a quiz was actually started and
  // hasn't already been saved via the natural-completion path below.
  // Note: this can't catch an actual browser tab/window close — that would
  // need navigator.sendBeacon, which can't carry Supabase's auth headers,
  // so a hard tab close isn't reliably recoverable here.
  useEffect(() => {
    return () => {
      if (quizStartedRef.current && !savedRef.current) {
        saveAttempt(resultsRef.current.length, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startQuiz(chosenCategory) {
    setStep('loading')
    setCategory(chosenCategory)
    const filter = chosenCategory === 'wrong_only' ? 'incorrect' : 'all'
    const rows = await fetchWordStatuses(user.id, filter)
    const words = shuffle(rows.map((r) => r.words))

    if (words.length === 0) {
      setStep('empty')
      return
    }

    setQueue(words)
    setIndex(0)
    setResults([])
    setOptions(buildOptions(words[0]))
    setSelected(null)
    quizStartedRef.current = true
    setStep('playing')
    logEvent(user.id, 'quiz_started', { category: chosenCategory, word_count: words.length })
  }

  async function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const word = queue[index]
    const result = option.isCorrect ? 'correct' : 'incorrect'
    await upsertWordStatus(user.id, word.id, result)
    setResults((prev) => [...prev, { word: word.word, result }])
  }

  async function handleNext() {
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      await saveAttempt(queue.length, false)
      setStep('complete')
      return
    }
    setIndex(nextIndex)
    setOptions(buildOptions(queue[nextIndex]))
    setSelected(null)
  }

  const currentWord = queue[index]
  const correctCount = results.filter((r) => r.result === 'correct').length

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={() => navigate('/review')}>
            ← Back
          </button>
        </div>

        {step === 'category' && (
          <div className="category-choice">
            <p>What should this quiz cover?</p>
            <button type="button" className="btn btn-secondary" onClick={() => startQuiz('all')}>
              All words
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => startQuiz('wrong_only')}>
              Only wrong
            </button>
          </div>
        )}

        {step === 'loading' && <div className="loading-state">Loading…</div>}

        {step === 'empty' && (
          <div className="empty-state">
            No words match that category yet.
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/review')}>
                Back to My Words
              </button>
            </div>
          </div>
        )}

        {step === 'playing' && currentWord && (
          <>
            <p className="quiz-word">{currentWord.word}</p>
            <div className="quiz-options">
              {options.map((opt, i) => {
                let cls = 'quiz-option'
                if (selected) {
                  if (opt.isCorrect) cls += ' correct'
                  else if (opt === selected) cls += ' incorrect'
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className={cls}
                    disabled={!!selected}
                    onClick={() => handleSelect(opt)}
                  >
                    {opt.text}
                  </button>
                )
              })}
            </div>
            {selected && (
              <button type="button" className="btn btn-primary" onClick={handleNext}>
                {index + 1 >= queue.length ? 'Finish quiz' : 'Next word'}
              </button>
            )}
          </>
        )}

        {step === 'complete' && (
          <div className="reveal-panel">
            <p className="reveal-result won">Quiz complete</p>
            <p className="quiz-complete-score">
              {correctCount}/{results.length} correct
            </p>
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/quiz-score')}>
                View quiz score
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/review')}>
                My Words
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

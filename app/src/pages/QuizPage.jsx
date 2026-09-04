import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchWordStatuses, upsertWordStatus } from '../lib/wordStatus'
import { fetchProfile, saveProfile } from '../lib/userProfile'
import { getNextWord, fetchDistractorWords } from '../lib/wordSelection'
import { applyRoundResult } from '../lib/adaptiveTier'
import { createQuizAttempt, saveQuizResults } from '../lib/quizAttempts'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'
import { maskWord } from '../lib/maskWord'

const SESSION_LENGTH = 10
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

// Contextual-closest-meaning cloze: the target word's own sentence, blanked,
// with 4 other real words (matching part of speech, so wrong answers can't
// be eliminated by grammar alone) as tempting alternatives.
async function buildClozeOptions(word) {
  const distractors = await fetchDistractorWords(word.part_of_speech, word.id, 4)
  return shuffle([
    { id: word.id, word: word.word, isCorrect: true },
    ...distractors.map((d) => ({ id: d.id, word: d.word, isCorrect: false })),
  ])
}

// "All words" draws a fresh tier-adaptive set from the whole bank (the same
// weighted-tier selection Hangman used to drive) rather than only words the
// user has already attempted — otherwise a brand-new user with no
// user_word_status rows would have nothing to quiz on.
async function drawAdaptiveQueue(currentTier, count) {
  const servedIds = []
  const words = []
  for (let i = 0; i < count; i++) {
    const w = await getNextWord(currentTier, servedIds)
    if (!w) break
    servedIds.push(w.id)
    words.push(w)
  }
  return words
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
  const [profile, setProfile] = useState(null)

  // A quiz attempt must save exactly once, whether the user finishes
  // naturally or navigates away mid-quiz. resultsRef is written directly at
  // the point setResults is called (inside handleSelect), not mirrored via
  // a separate useEffect keyed on `results` — that effect only runs on the
  // next full commit+effect cycle, which hasn't necessarily happened yet
  // when handleBack/handleNext read it right after awaiting
  // pendingUpdateRef, so it would under-count by exactly the answer that
  // was just awaited.
  const resultsRef = useRef(results)
  const categoryRef = useRef(category)
  const quizStartedRef = useRef(false)
  const savedRef = useRef(false)
  // Read by handleSelect so an answer always updates the tier/streak state
  // that was current at the time, even though profile also lives in state.
  const profileRef = useRef(null)
  // handleSelect does two awaited network calls (word status, profile save)
  // before results actually update. The Next/Finish button is clickable the
  // instant an answer is picked (independent of that async work, since
  // `selected` is set synchronously), so a fast tap could otherwise advance
  // — or even finish the quiz — before the current answer's profile update
  // lands, silently dropping it. handleNext awaits this to guarantee it
  // never runs ahead of that.
  const pendingUpdateRef = useRef(null)

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
    const p = await fetchProfile(user.id)
    profileRef.current = p
    setProfile(p)

    const words =
      chosenCategory === 'wrong_only'
        ? shuffle((await fetchWordStatuses(user.id, 'incorrect')).map((r) => r.words))
        : await drawAdaptiveQueue(p.current_tier, SESSION_LENGTH)

    if (words.length === 0) {
      setStep('empty')
      return
    }

    setQueue(words)
    setIndex(0)
    setResults([])
    resultsRef.current = []
    setOptions(await buildClozeOptions(words[0]))
    setSelected(null)
    quizStartedRef.current = true
    savedRef.current = false
    setStep('playing')
    logEvent(user.id, 'quiz_started', { category: chosenCategory, word_count: words.length })
  }

  function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const word = queue[index]
    const result = option.isCorrect ? 'correct' : 'incorrect'
    const task = (async () => {
      await upsertWordStatus(user.id, word.id, result)
      const updates = applyRoundResult(profileRef.current, { tier: word.tier, result, usedMaxAttempts: false })
      const updatedProfile = await saveProfile(user.id, updates)
      profileRef.current = updatedProfile
      setProfile(updatedProfile)
      const newResults = [...resultsRef.current, { word: word.word, result }]
      resultsRef.current = newResults
      setResults(newResults)
    })()
    pendingUpdateRef.current = task
    return task
  }

  async function handleNext() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      await saveAttempt(queue.length, false)
      setStep('complete')
      return
    }
    setIndex(nextIndex)
    setOptions(await buildClozeOptions(queue[nextIndex]))
    setSelected(null)
  }

  async function handleBack() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    if (quizStartedRef.current) await saveAttempt(resultsRef.current.length, true)
    navigate('/practice')
  }

  const currentWord = queue[index]
  const correctCount = results.filter((r) => r.result === 'correct').length
  const maskedSentence =
    currentWord?.example_sentence ? maskWord(currentWord.example_sentence, currentWord.word) : null

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={handleBack}>
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
              <button type="button" className="btn btn-primary" onClick={() => navigate('/practice')}>
                Back to Practice
              </button>
            </div>
          </div>
        )}

        {step === 'playing' && currentWord && (
          <>
            {maskedSentence && <p className="context-sentence">{maskedSentence}</p>}
            <div className="quiz-options">
              {options.map((opt, i) => {
                let cls = 'quiz-option'
                if (selected) {
                  if (opt.isCorrect) cls += ' correct'
                  else if (opt === selected) cls += ' incorrect'
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={cls}
                    disabled={!!selected}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="option-letter">{OPTION_LETTERS[i]}.</span> {opt.word}
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
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/practice')}>
                Practice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

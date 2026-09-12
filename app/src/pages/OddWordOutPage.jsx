import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchEligibleClusters, buildOddWordOutQuestion } from '../lib/wordClusters'
import { fetchWordStatuses, upsertWordStatus } from '../lib/wordStatus'
import { fetchProfile, saveProfile } from '../lib/userProfile'
import { recordPracticeActivity } from '../lib/adaptiveTier'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'
import { PRACTICE_TYPES } from '../lib/practiceTypes'

const SESSION_LENGTH = 10
const PRACTICE_TYPE = PRACTICE_TYPES.ODD_WORD_OUT

// Questions are assembled at runtime (see buildOddWordOutQuestion), not
// pre-generated — a cluster's members and the pool of candidate "odd"
// words are read once per session, and each round randomly draws 3
// members + 1 odd word from a different cluster. Correctness is tracked
// against the odd word's word_id in user_word_status, scoped to this
// practice_type.
//
// "Only wrong" pins the odd word to one the user previously got wrong
// (forcedWordsRef) instead of picking it at random each round — the
// cluster of 3 is still chosen fresh, tier-matched around that word.
export default function OddWordOutPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('category') // 'category' | 'loading' | 'empty' | 'playing' | 'complete'
  const [round, setRound] = useState(0)
  const [totalRounds, setTotalRounds] = useState(SESSION_LENGTH)
  const [question, setQuestion] = useState(null)
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState([])

  const clustersRef = useRef([])
  const usedClusterIdsRef = useRef([])
  // Empty in "All" mode (buildOddWordOutQuestion picks the odd word at
  // random each round); a shuffled list of previously-wrong word rows in
  // "Only wrong" mode, one consumed per round.
  const forcedWordsRef = useRef([])
  const sessionStartedRef = useRef(false)
  const savedRef = useRef(false)
  const resultsRef = useRef([])
  // Read by handleSelect so the streak/words-played update always builds
  // on the profile state that was current at the time.
  const profileRef = useRef(null)
  // See ConfusingPairsPage/QuizPage: handleSelect awaits a status write
  // before results update, but Next/Finish is clickable the instant an
  // answer is picked — this stops it from racing ahead of that write.
  const pendingUpdateRef = useRef(null)

  function endSession(eventType) {
    if (savedRef.current) return
    savedRef.current = true
    logEvent(user.id, eventType, { total_words_shown: resultsRef.current.length })
  }

  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !savedRef.current) {
        endSession('odd_word_out_exited')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function nextQuestion(roundIndex) {
    const forcedOddWord = forcedWordsRef.current[roundIndex] ?? null
    const q = buildOddWordOutQuestion(clustersRef.current, {
      excludeClusterIds: usedClusterIdsRef.current,
      forcedOddWord,
    })
    if (!q) return null
    usedClusterIdsRef.current = [...usedClusterIdsRef.current, q.clusterId].slice(-3)
    setQuestion(q)
    setSelected(null)
    return q
  }

  async function startSession(category) {
    setStep('loading')
    const [clusters, p, wrongWords] = await Promise.all([
      fetchEligibleClusters(),
      fetchProfile(user.id),
      category === 'wrong_only'
        ? fetchWordStatuses(user.id, PRACTICE_TYPE, 'incorrect').then((rows) => shuffle(rows.map((r) => r.words)))
        : Promise.resolve([]),
    ])
    clustersRef.current = clusters
    profileRef.current = p

    if (clusters.length < 2 || (category === 'wrong_only' && wrongWords.length === 0)) {
      setStep('empty')
      return
    }

    forcedWordsRef.current = category === 'wrong_only' ? wrongWords.slice(0, SESSION_LENGTH) : []
    const total = category === 'wrong_only' ? forcedWordsRef.current.length : SESSION_LENGTH
    setTotalRounds(total)

    usedClusterIdsRef.current = []
    setRound(0)
    setResults([])
    resultsRef.current = []
    const q = nextQuestion(0)
    if (!q) {
      setStep('empty')
      return
    }
    sessionStartedRef.current = true
    savedRef.current = false
    setStep('playing')
    logEvent(user.id, 'odd_word_out_started', { category, session_length: total })
  }

  function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const result = option.isOdd ? 'correct' : 'incorrect'
    const task = (async () => {
      await upsertWordStatus(user.id, question.oddWord.id, result, PRACTICE_TYPE)
      profileRef.current = await saveProfile(user.id, recordPracticeActivity(profileRef.current))
      const newResults = [...resultsRef.current, { result }]
      resultsRef.current = newResults
      setResults(newResults)
    })()
    pendingUpdateRef.current = task
    return task
  }

  async function handleNext() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    const nextRound = round + 1
    if (nextRound >= totalRounds) {
      endSession('odd_word_out_completed')
      setStep('complete')
      return
    }
    const q = nextQuestion(nextRound)
    if (!q) {
      endSession('odd_word_out_completed')
      setStep('complete')
      return
    }
    setRound(nextRound)
  }

  async function handleBack() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    endSession('odd_word_out_exited')
    navigate('/practice')
  }

  const correctCount = results.filter((r) => r.result === 'correct').length

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
            <p>Four words, three sharing a meaning — pick the one that doesn't fit.</p>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('all')}>
              All words
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('wrong_only')}>
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

        {step === 'playing' && question && (
          <>
            <p className="context-sentence">Three of these words share a meaning. Pick the one that doesn't fit.</p>
            <div className="grid-options">
              {question.options.map((opt) => {
                let cls = 'quiz-option'
                if (selected) {
                  if (opt.isOdd) cls += ' correct'
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
                    {opt.word}
                  </button>
                )
              })}
            </div>

            {selected && (
              <>
                {selected.isOdd ? (
                  <>
                    <p className="reveal-definition">Shared meaning: {question.theme}</p>
                    <p className="reveal-example">
                      <strong>{question.oddWord.word}</strong> means {question.oddWord.correct_definition} — a
                      different sense from the other three.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="reveal-definition">
                      You picked: <strong>{selected.word}</strong> — {selected.correct_definition}
                    </p>
                    <p className="reveal-definition">
                      Correct answer: <strong>{question.oddWord.word}</strong> — {question.oddWord.correct_definition}
                    </p>
                    <p className="reveal-example">Shared meaning of the other three: {question.theme}</p>
                  </>
                )}
                <button type="button" className="btn btn-primary" onClick={handleNext}>
                  {round + 1 >= totalRounds ? 'Finish' : 'Next'}
                </button>
              </>
            )}
          </>
        )}

        {step === 'complete' && (
          <div className="reveal-panel">
            <p className="reveal-result won">Session complete</p>
            <p className="quiz-complete-score">
              {correctCount}/{results.length} correct
            </p>
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => startSession('all')}>
                Play again
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

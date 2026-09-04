import { Routes, Route } from 'react-router-dom'
import { LoadingScreen, RequireAuth, RequireGuest } from './components/RouteGuards'
import WelcomePage from './pages/WelcomePage'
import AuthPage from './pages/AuthPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import HomePage from './pages/HomePage'
import PracticePage from './pages/PracticePage'
import LearnPage from './pages/LearnPage'
import WordFamilyPage from './pages/WordFamilyPage'
import SettingsPage from './pages/SettingsPage'
import FeedbackPage from './pages/FeedbackPage'
import MyWordsPage from './pages/MyWordsPage'
import QuizPage from './pages/QuizPage'
import QuizScorePage from './pages/QuizScorePage'
import { useAuth } from './lib/AuthContext'

export default function App() {
  const { loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireGuest>
            <WelcomePage />
          </RequireGuest>
        }
      />
      <Route
        path="/login"
        element={
          <RequireGuest>
            <AuthPage />
          </RequireGuest>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/practice"
        element={
          <RequireAuth>
            <PracticePage />
          </RequireAuth>
        }
      />
      <Route
        path="/learn"
        element={
          <RequireAuth>
            <LearnPage />
          </RequireAuth>
        }
      />
      <Route
        path="/family"
        element={
          <RequireAuth>
            <WordFamilyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/feedback"
        element={
          <RequireAuth>
            <FeedbackPage />
          </RequireAuth>
        }
      />
      <Route
        path="/review"
        element={
          <RequireAuth>
            <MyWordsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/quiz"
        element={
          <RequireAuth>
            <QuizPage />
          </RequireAuth>
        }
      />
      <Route
        path="/quiz-score"
        element={
          <RequireAuth>
            <QuizScorePage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

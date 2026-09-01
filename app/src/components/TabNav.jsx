import { Link } from 'react-router-dom'

export default function TabNav({ active }) {
  return (
    <div className="filter-toggle">
      <Link to="/review" className={active === 'words' ? 'active' : ''}>
        My Words
      </Link>
      <Link to="/quiz-score" className={active === 'score' ? 'active' : ''}>
        My Quiz Score
      </Link>
    </div>
  )
}

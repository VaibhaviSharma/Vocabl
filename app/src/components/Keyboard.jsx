const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

export default function Keyboard({ guessedCorrect, guessedWrong, onGuess }) {
  return (
    <div className="hangman-keyboard">
      {KEYBOARD_ROWS.map((row, ri) => (
        <div className="keyboard-row" key={ri}>
          {[...row].map((letter) => {
            const lower = letter.toLowerCase()
            const isCorrect = guessedCorrect.has(lower)
            const isWrong = guessedWrong.has(lower)
            return (
              <button
                key={letter}
                type="button"
                className={`key${isCorrect ? ' key-correct' : ''}${isWrong ? ' key-wrong' : ''}`}
                disabled={isCorrect || isWrong}
                onClick={() => onGuess(lower)}
              >
                {letter}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

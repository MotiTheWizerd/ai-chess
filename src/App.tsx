import { ChessGame } from './components/ChessGame'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>
          ♟ ai-chess
        </h1>
        <p className="app__tagline">
          A board that actually plays by the rules — the brain comes next.
        </p>
      </header>

      <main>
        <ChessGame />
      </main>

      <footer className="app__footer">
        Built by Moti &amp; Claude · referee: chess.js · board: react-chessboard
      </footer>
    </div>
  )
}

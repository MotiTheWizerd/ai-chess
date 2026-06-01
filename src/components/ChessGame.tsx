import { useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard'

const HIGHLIGHT = 'rgba(255, 215, 0, 0.45)'
const SELECTED = 'rgba(72, 153, 255, 0.55)'
const LAST_MOVE = 'rgba(155, 199, 0, 0.41)'

type GameStatus = {
  text: string
  tone: 'normal' | 'check' | 'over'
}

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

type PendingPromotion = {
  from: Square
  to: Square
  color: 'w' | 'b'
}

export function ChessGame() {
  // The chess.js instance is our deterministic referee. It owns the rules;
  // we never let an illegal move touch the board.
  const gameRef = useRef(new Chess())
  const game = gameRef.current

  // `fen` is the single source of truth that drives re-renders.
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [selected, setSelected] = useState<Square | null>(null)

  // A pawn move awaiting the player's promotion choice (null = none pending).
  const [pending, setPending] = useState<PendingPromotion | null>(null)

  // Recompute derived view-state whenever the position changes.
  const { history, status, lastMove } = useMemo(() => {
    const verbose = game.history({ verbose: true })
    const last = verbose.at(-1)
    return {
      history: game.history(),
      status: computeStatus(game),
      lastMove: last ? { from: last.from, to: last.to } : null,
    }
  }, [fen, game])

  // Squares to tint: last move + currently selected piece + its legal targets.
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    if (lastMove) {
      styles[lastMove.from] = { background: LAST_MOVE }
      styles[lastMove.to] = { background: LAST_MOVE }
    }
    if (selected) {
      styles[selected] = { background: SELECTED }
      for (const move of game.moves({ square: selected, verbose: true })) {
        const isCapture = move.captured != null
        styles[move.to] = {
          background: isCapture
            ? `radial-gradient(circle, transparent 55%, ${HIGHLIGHT} 56%)`
            : `radial-gradient(circle, ${HIGHLIGHT} 22%, transparent 23%)`,
        }
      }
    }
    return styles
  }, [selected, lastMove, fen, game])

  /** Does moving from→to require a promotion choice? */
  function needsPromotion(from: Square, to: Square): boolean {
    return game
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to && m.promotion != null)
  }

  /** Attempt a move through the referee. Returns true if it was applied. */
  function tryMove(from: Square, to: Square, promotion?: PromotionPiece): boolean {
    // Pawn reaching the last rank: defer the move until the player picks a piece.
    if (!promotion && needsPromotion(from, to)) {
      setPending({ from, to, color: game.turn() })
      return false
    }
    try {
      game.move({ from, to, promotion: promotion ?? 'q' })
      setFen(game.fen())
      setSelected(null)
      return true
    } catch {
      return false // illegal — chess.js threw, board snaps the piece back
    }
  }

  /** Resolve a pending promotion with the player's chosen piece. */
  function choosePromotion(piece: PromotionPiece) {
    if (!pending) return
    tryMove(pending.from, pending.to, piece)
    setPending(null)
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false
    return tryMove(sourceSquare as Square, targetSquare as Square)
  }

  // Click-to-move: first click selects, second click moves (or reselects).
  function onSquareClick({ square, piece }: SquareHandlerArgs) {
    const sq = square as Square
    if (selected) {
      if (sq === selected) {
        setSelected(null)
        return
      }
      if (tryMove(selected, sq)) return
    }
    // Select only if there's a piece of the side to move on this square.
    if (piece && piece.pieceType[0] === game.turn()) {
      setSelected(sq)
    } else {
      setSelected(null)
    }
  }

  function reset() {
    game.reset()
    setFen(game.fen())
    setSelected(null)
  }

  function undo() {
    game.undo()
    setFen(game.fen())
    setSelected(null)
  }

  function flip() {
    setOrientation((o) => (o === 'white' ? 'black' : 'white'))
  }

  return (
    <div className="game">
      <div className="board-wrap">
        <Chessboard
          options={{
            position: fen,
            onPieceDrop,
            onSquareClick,
            squareStyles,
            boardOrientation: orientation,
            id: 'ai-chess-board',
          }}
        />
        {pending && (
          <PromotionPicker
            color={pending.color}
            onPick={choosePromotion}
            onCancel={() => setPending(null)}
          />
        )}
      </div>

      <aside className="panel">
        <div className={`status status--${status.tone}`}>{status.text}</div>

        <div className="controls">
          <button onClick={undo} disabled={history.length === 0}>↶ Undo</button>
          <button onClick={flip}>⇅ Flip</button>
          <button onClick={reset} className="danger">↻ New game</button>
        </div>

        <MoveList history={history} />
      </aside>
    </div>
  )
}

function computeStatus(game: Chess): GameStatus {
  const sideToMove = game.turn() === 'w' ? 'White' : 'Black'
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White'
    return { text: `Checkmate — ${winner} wins`, tone: 'over' }
  }
  if (game.isStalemate()) return { text: 'Draw — stalemate', tone: 'over' }
  if (game.isInsufficientMaterial()) return { text: 'Draw — insufficient material', tone: 'over' }
  if (game.isThreefoldRepetition()) return { text: 'Draw — threefold repetition', tone: 'over' }
  if (game.isDraw()) return { text: 'Draw — 50-move rule', tone: 'over' }
  if (game.inCheck()) return { text: `${sideToMove} to move — check!`, tone: 'check' }
  return { text: `${sideToMove} to move`, tone: 'normal' }
}

const PROMO_GLYPHS: Record<'w' | 'b', Record<PromotionPiece, string>> = {
  w: { q: '♕', r: '♖', b: '♗', n: '♘' },
  b: { q: '♛', r: '♜', b: '♝', n: '♞' },
}

const PROMO_LABELS: Record<PromotionPiece, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
}

function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: 'w' | 'b'
  onPick: (piece: PromotionPiece) => void
  onCancel: () => void
}) {
  const order: PromotionPiece[] = ['q', 'r', 'b', 'n']
  return (
    <div className="promo" onClick={onCancel}>
      <div className="promo__panel" onClick={(e) => e.stopPropagation()}>
        <span className="promo__title">Promote to…</span>
        <div className="promo__choices">
          {order.map((piece) => (
            <button
              key={piece}
              className="promo__piece"
              onClick={() => onPick(piece)}
              aria-label={PROMO_LABELS[piece]}
              title={PROMO_LABELS[piece]}
            >
              {PROMO_GLYPHS[color][piece]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MoveList({ history }: { history: string[] }) {
  // Pair up plies into numbered full-moves: 1. e4 e5 ...
  const rows: { num: number; white: string; black?: string }[] = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push({ num: i / 2 + 1, white: history[i], black: history[i + 1] })
  }

  return (
    <div className="moves">
      <h2>Moves</h2>
      {rows.length === 0 ? (
        <p className="moves__empty">No moves yet — drag a piece to begin.</p>
      ) : (
        <ol className="moves__list">
          {rows.map((row) => (
            <li key={row.num}>
              <span className="moves__num">{row.num}.</span>
              <span className="moves__ply">{row.white}</span>
              <span className="moves__ply">{row.black ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

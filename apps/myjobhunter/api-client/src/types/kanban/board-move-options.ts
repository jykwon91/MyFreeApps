import type { BoardMoveOutcome } from "./board-move-outcome";

/** What a platform supplies to move cards: its key generator and how it tells the person. */
export interface BoardMoveOptions {
  /** Makes a key for a move; the same move retried after a lost answer reuses it, so a card can't move twice. */
  newKey: () => string;
  notify: (outcome: BoardMoveOutcome) => void;
}

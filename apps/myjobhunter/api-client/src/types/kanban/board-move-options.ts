import type { BoardMoveOutcome } from "./board-move-outcome";

/** What a platform supplies to move cards: its key generator and how it tells the person. */
export interface BoardMoveOptions {
  /** A fresh key per move, so a retried request can't move a card twice. */
  newKey: () => string;
  notify: (outcome: BoardMoveOutcome) => void;
}

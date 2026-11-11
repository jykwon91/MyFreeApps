import type { RefinementTurn } from "./refinement-turn";

/** One row of the refinement transcript: a divider where the section changes, or a turn. */
export type ConversationItem = { kind: "divider"; section: string } | { kind: "turn"; turn: RefinementTurn };

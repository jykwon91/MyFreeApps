import type { AskFailure } from "@/games/wow-forever/types/ask/askFailure";
import type { AskPhase } from "@/games/wow-forever/types/ask/askPhase";
import type { AskTurnView } from "@/games/wow-forever/types/ask/askTurnView";

/** `useAskChat`: the thread, what's happening now and the controls. */
export interface AskChatState {
  turns: AskTurnView[];
  phase: AskPhase;
  /** When the answer being worked on started (for "Still working"); null when idle. */
  busySince: number | null;
  /** Step lines for the answer being worked on ("Searching the map for …"). */
  steps: string[];
  /** The question that failed, and why; Retry asks it again. */
  failure: AskFailure | null;
  failedQuestion: string | null;
  /** The composer's text (a cancelled question comes back here). */
  draft: string;
  setDraft: (text: string) => void;
  /** The chat has as many questions as one conversation allows. */
  full: boolean;
  /** "New chat" was just pressed and can be undone. */
  canUndo: boolean;
  ask: (question: string) => void;
  retry: () => void;
  cancel: () => void;
  newChat: () => void;
  undoNewChat: () => void;
}

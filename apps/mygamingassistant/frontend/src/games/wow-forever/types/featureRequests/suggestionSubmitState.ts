import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";
import type { SuggestionView } from "@/games/wow-forever/types/featureRequests/suggestionView";
import type { TurnstileTokenState } from "@/games/wow-forever/types/turnstileTokenState";

/** The "Suggest a feature" form (`hooks/featureRequests/useSuggestionSubmit.ts`). */
export interface SuggestionSubmitState {
  /** The idea being written (also kept in sessionStorage). */
  text: string;
  setText: (text: string) => void;
  view: SuggestionView;
  /** When the current send started (ms epoch), or null when nothing is in flight. */
  submittingSince: number | null;
  /** The per-address limit lifts at this time (ms epoch), when the server said; null otherwise. */
  blockedUntil: number | null;
  turnstile: TurnstileTokenState;
  send: (context: SubmissionContext) => void;
  /** Answer the clarifying question; an empty answer is "Skip, submit as is". */
  answer: (reply: string, context: SubmissionContext) => void;
  cancel: () => void;
  /** "Looks right, thanks" / "Send another idea": a fresh, empty form. */
  startOver: () => void;
  /** "That's not what I meant": back to the form with the same text. */
  correct: () => void;
}

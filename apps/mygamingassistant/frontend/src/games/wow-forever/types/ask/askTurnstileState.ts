import type { TurnstileTokenState } from "@/games/wow-forever/types/turnstileTokenState";

/** The chat's human check: the widget's state, and a way to wait for (and spend) one token per question. */
export interface AskTurnstileState {
  widget: TurnstileTokenState;
  /** A fresh token ("" when the build has no site key); waits for the widget if it hasn't answered yet. Rejects on abort. */
  takeToken: (signal: AbortSignal) => Promise<string>;
}

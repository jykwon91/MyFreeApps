import type { SuggestionMode } from "./suggestion-mode";

/** The suggestion card's state and actions, the same on the website and the phone. */
export interface RefinementProposalControls {
  mode: SuggestionMode;
  openCustom: () => void;
  closeCustom: () => void;
  /** "Write my own": replaces the target outright. */
  customText: string;
  setCustomText: (text: string) => void;
  /** The chat composer: style hints, clarify answers, redirections. Kept apart from `customText`. */
  composerText: string;
  setComposerText: (text: string) => void;
  /** A just-sent composer message, shown until the real turn arrives. */
  pendingEcho: string | null;
  /** Any action on the card, or `externalPending`, is in flight. */
  isPending: boolean;
  isAccepting: boolean;
  isForcing: boolean;
  isSubmittingCustom: boolean;
  isSkipping: boolean;
  /** A new take is on its way, so the old proposal is stale. */
  isRegenerating: boolean;
  accept: () => Promise<void>;
  /** Applies a proposal the fact guard held, once the user confirms the details are right. */
  forceAccept: () => Promise<void>;
  submitCustom: () => Promise<void>;
  send: () => Promise<void>;
  /** Another take without a note. */
  regenerate: () => Promise<void>;
  skip: () => Promise<void>;
}

export interface ResumeSuggestionBodyProps {
  clarifyingQuestion: string | null;
  proposal: string | null;
  rationale: string | null;
  isPending: boolean;
  isRegenerating: boolean;
  /** The fact guard held a rewrite the person can confirm is accurate. */
  canForce: boolean;
  onForce: () => Promise<void>;
  isForcing: boolean;
}

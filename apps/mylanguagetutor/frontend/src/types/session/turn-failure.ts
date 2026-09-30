/**
 * A turn that could not be completed, and what the learner can do about it.
 * ``text`` is kept so "Try again" resubmits exactly the same words.
 */
export interface TurnFailure {
  code: string;
  text: string;
  retryable: boolean;
  /** The transcript entry to replace on retry (null when none was shown). */
  entryKey: string | null;
}

/**
 * The one thing the operator can actually do about a filed increase.
 *
 * There is no in-app switch. A Texas landlord policy is agent-placed — it
 * cannot be quoted or bought online — so the deliverable of the whole
 * rate-watch section is a short list of carrier names and a date to raise them
 * by. The first cut left that implied by a twelve-pixel blurb under a heading,
 * and the operator's first question on reading the screen was "what is the
 * action item".
 */
export interface RateWatchAction {
  /** The renewal to beat, ISO. Null when the policy has no recorded end date. */
  renewalDate: string | null;
  /** Carriers holding rates flat — the names to ask an agent to quote. */
  carrierNames: string[];
}

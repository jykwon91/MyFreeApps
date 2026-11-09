/** The sentence the rate-watch section leads with, and how loudly to say it. */
export interface MortgageRateWatchVerdict {
  tone: "clear" | "alert";
  headline: string;
  detail: string | null;
}

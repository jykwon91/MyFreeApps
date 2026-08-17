import type { RateWatchVerdict as Verdict } from "@/shared/types/insurance/rate-watch-verdict";

export interface RateWatchVerdictProps {
  verdict: Verdict;
}

/**
 * The answer, before the evidence.
 *
 * Deliberately the largest text in the section and the first thing under the
 * button. Everything below it — the per-policy cards, the market lists — is
 * support for this sentence, and is sized accordingly.
 */
export default function RateWatchVerdict({ verdict }: RateWatchVerdictProps) {
  const alert = verdict.tone === "alert";

  return (
    <div
      className={`rounded-lg border p-4 ${
        alert
          ? "border-orange-500/40 bg-orange-500/5"
          : "border-green-600/40 bg-green-600/5"
      }`}
      data-testid="rate-watch-verdict"
    >
      <p className="text-lg font-semibold leading-snug">{verdict.headline}</p>
      {verdict.detail ? (
        <p
          className="text-sm text-muted-foreground mt-1"
          data-testid="rate-watch-verdict-detail"
        >
          {verdict.detail}
        </p>
      ) : null}
    </div>
  );
}

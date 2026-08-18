import type { MortgageRateWatchVerdict } from "@/shared/types/mortgage/mortgage-rate-watch-verdict";

export interface MortgageRateWatchVerdictBannerProps {
  verdict: MortgageRateWatchVerdict;
}

/**
 * The answer, before the evidence.
 *
 * Deliberately the largest text in the section and the first thing under the
 * button. Everything below it — the per-loan cards, the survey line — is
 * support for this sentence, and is sized accordingly.
 */
export default function MortgageRateWatchVerdictBanner({
  verdict,
}: MortgageRateWatchVerdictBannerProps) {
  const alert = verdict.tone === "alert";

  return (
    <div
      className={`rounded-lg border p-4 ${
        alert
          ? "border-orange-500/40 bg-orange-500/5"
          : "border-green-600/40 bg-green-600/5"
      }`}
      data-testid="mortgage-rate-watch-verdict"
    >
      <p className="text-lg font-semibold leading-snug">{verdict.headline}</p>
      {verdict.detail ? (
        <p
          className="text-sm text-muted-foreground mt-1"
          data-testid="mortgage-rate-watch-verdict-detail"
        >
          {verdict.detail}
        </p>
      ) : null}
    </div>
  );
}

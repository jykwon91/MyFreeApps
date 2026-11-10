/**
 * The fit score as a percentage. It arrives as a Decimal string and stays one,
 * so nothing is lost to float rounding. Null when the application has no score.
 */
export function formatFitScore(fitScore: string | null): string | null {
  return fitScore === null ? null : `${fitScore}%`;
}

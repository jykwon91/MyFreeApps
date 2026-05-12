/**
 * ConfidenceBadge — displays classifier confidence as a colored pill badge.
 * Green ≥ 0.75, yellow ≥ 0.5, red < 0.5, grey = unclassified (null).
 */

interface ConfidenceBadgeProps {
  confidence: number | null;
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === null) {
    return (
      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        Unclassified
      </span>
    );
  }
  const pct = Math.round(confidence * 100);
  const colorClass =
    confidence >= 0.75
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : confidence >= 0.5
        ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400";
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${colorClass}`}>
      {pct}% confidence
    </span>
  );
}

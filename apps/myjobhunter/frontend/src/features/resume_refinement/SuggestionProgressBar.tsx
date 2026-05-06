interface SuggestionProgressBarProps {
  /** Number of suggestions the user has resolved (accepted/skipped/etc). */
  completed: number;
  /** Total number of suggestions in the session. */
  total: number;
}

/**
 * Thin horizontal progress bar that spans the full session, not just
 * the current index. Renders nothing when the session hasn't loaded
 * targets yet (total=0) so the suggestion card stays compact during
 * the brief startup window.
 */
export default function SuggestionProgressBar({
  completed,
  total,
}: SuggestionProgressBarProps) {
  if (total <= 0) return null;
  const ratio = Math.min(Math.max(completed / total, 0), 1);
  return (
    <div
      className="h-1 w-full bg-muted rounded-full overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
      aria-label={`${completed} of ${total} suggestions resolved`}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

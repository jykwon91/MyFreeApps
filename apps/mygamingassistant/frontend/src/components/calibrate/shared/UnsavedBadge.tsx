/**
 * UnsavedBadge — tiny dirty-state indicator.
 *
 * Used on side-nav items, polygon list rows, and the top-bar global indicator.
 * Accessible-by-default: amber color + literal "edited" dot glyph (not color
 * alone, per the design's a11y spec).
 */
interface UnsavedBadgeProps {
  /** Optional label override (defaults to "edited"). */
  label?: string;
  /** Hide the dot glyph (used in cramped places like list-item rows). */
  compact?: boolean;
}

export default function UnsavedBadge({
  label = "edited",
  compact = false,
}: UnsavedBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
      aria-label={`Section ${label}`}
      role="status"
    >
      <span aria-hidden className="text-amber-600 dark:text-amber-400">
        •
      </span>
      {!compact && <span>{label}</span>}
    </span>
  );
}

import { Star } from "lucide-react";
import { cn } from "@platform/ui";

interface Props {
  /** Rating 1-5, or null when unrated. */
  value: number | null;
  /** Star edge length in px. Defaults to 16. */
  size?: number;
  /** When true, renders a muted dash instead of empty stars for null. */
  showEmptyDash?: boolean;
  className?: string;
}

const MAX_STARS = 5;

/**
 * Read-only star rating. Renders `value` filled stars out of five. When
 * `value` is null and `showEmptyDash` is set, renders a muted dash so list
 * rows stay aligned without implying a zero rating.
 */
export default function StarRating({
  value,
  size = 16,
  showEmptyDash = false,
  className,
}: Props) {
  if (value === null && showEmptyDash) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const filled = value ?? 0;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={value === null ? "No rating" : `${value} out of 5 stars`}
    >
      {Array.from({ length: MAX_STARS }).map((_, i) => (
        <Star
          key={i}
          width={size}
          height={size}
          className={
            i < filled
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground/40"
          }
          aria-hidden
        />
      ))}
    </span>
  );
}

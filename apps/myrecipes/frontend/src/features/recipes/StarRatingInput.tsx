import { Star } from "lucide-react";

interface Props {
  /** Current selection 1-5, or null when unset. */
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const MAX_STARS = 5;

/**
 * Interactive 1-5 star picker for the "I made it" cook-log form. Each star is
 * a 44px touch target. Clicking a star sets the rating to that value.
 */
export default function StarRatingInput({ value, onChange, disabled }: Props) {
  const selected = value ?? 0;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {Array.from({ length: MAX_STARS }).map((_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= selected;
        return (
          <button
            key={starValue}
            type="button"
            disabled={disabled}
            onClick={() => onChange(starValue)}
            role="radio"
            aria-checked={starValue === selected}
            aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
          >
            <Star
              width={24}
              height={24}
              className={
                isFilled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-muted-foreground/50"
              }
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

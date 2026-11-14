export interface StarRatingProps {
  /** Rating 1-5, or null when unrated. */
  rating: number | null;
  /** What a screen reader says instead of the default "best rating 4 out of 5". */
  accessibilityLabel?: string;
}

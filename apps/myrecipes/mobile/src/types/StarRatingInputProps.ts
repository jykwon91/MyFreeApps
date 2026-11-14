export interface StarRatingInputProps {
  /** The rating picked, 1-5, or null before one is. */
  value: number | null;
  onChange: (rating: number) => void;
  disabled: boolean;
}

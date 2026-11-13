import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { EMPTY_STAR, FILLED_STAR, MAX_STARS, NO_RATING_DASH } from "../../constants/recipes";
import type { StarRatingProps } from "../../types/StarRatingProps";
import { ratingLabel } from "../../utils/ratingLabel";

/** A rating out of five as stars, or a dash when unrated. Read as words, not as symbols. */
export default function StarRating({ rating }: StarRatingProps) {
  const { colors, fontSize } = useTheme();
  const stars = rating === null ? NO_RATING_DASH : FILLED_STAR.repeat(rating) + EMPTY_STAR.repeat(MAX_STARS - rating);

  return (
    <Text accessibilityLabel={ratingLabel(rating)} style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
      {stars}
    </Text>
  );
}

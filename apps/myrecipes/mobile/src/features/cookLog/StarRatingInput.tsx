import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { EMPTY_STAR, FILLED_STAR, MAX_STARS } from "../../constants/recipes";
import type { StarRatingInputProps } from "../../types/StarRatingInputProps";

/** Picks a 1-5 rating, as the website's star picker does: each star is a full-size radio button. */
export default function StarRatingInput({ value, onChange, disabled }: StarRatingInputProps) {
  const { colors, fontSize } = useTheme();
  const selected = value ?? 0;

  return (
    <View accessibilityLabel={SHARED.ratingGroupLabel} accessibilityRole="radiogroup" style={{ flexDirection: "row" }}>
      {Array.from({ length: MAX_STARS }, (_, index) => {
        const stars = index + 1;
        const isFilled = stars <= selected;
        return (
          <Pressable
            accessibilityLabel={SHARED.starLabel(stars)}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === selected, disabled }}
            disabled={disabled}
            key={stars}
            onPress={() => onChange(stars)}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: isFilled ? colors.primary : colors.mutedForeground, fontSize: fontSize.xl }}>
              {isFilled ? FILLED_STAR : EMPTY_STAR}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

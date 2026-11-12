import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MULTILINE_MIN_HEIGHT, NEW_RECIPE_MESSAGES } from "../../constants/newRecipe";
import { TWEAK_RECIPE_MESSAGES as MESSAGES, TWEAK_SKELETON_INGREDIENTS, TWEAK_SKELETON_STEPS } from "../../constants/tweakRecipe";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";

/** The tweak form's shape while the recipe is asked for: title, note, times, ingredients, steps. */
export default function TweakRecipeSkeleton() {
  const { colors, spacing, radius, fontSize } = useTheme();
  const field = fontSize.md * 3;
  const card = { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md };

  return (
    <View
      accessibilityLabel={MESSAGES.loading}
      accessible
      style={{ flex: 1, gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background }}
      testID="tweak-recipe-skeleton"
    >
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={fontSize.lg} width="70%" />
        <Skeleton height={fontSize.sm} width="90%" />
      </View>
      <Skeleton height={MULTILINE_MIN_HEIGHT} />
      <Skeleton height={field} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Skeleton height={field} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton height={field} />
        </View>
      </View>
      <RecipeSectionHeading>{NEW_RECIPE_MESSAGES.ingredientsHeading}</RecipeSectionHeading>
      {Array.from({ length: TWEAK_SKELETON_INGREDIENTS }, (_, index) => (
        <View key={index} style={card}>
          <Skeleton height={field} />
          <Skeleton height={field} width="60%" />
        </View>
      ))}
      <RecipeSectionHeading>{NEW_RECIPE_MESSAGES.stepsHeading}</RecipeSectionHeading>
      {Array.from({ length: TWEAK_SKELETON_STEPS }, (_, index) => (
        <Skeleton height={MULTILINE_MIN_HEIGHT} key={index} />
      ))}
    </View>
  );
}

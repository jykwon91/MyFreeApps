import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import RecipeSectionHeading from "./RecipeSectionHeading";

const INGREDIENT_COUNT = 5;
const STEP_COUNT = 3;

export default function RecipeDetailSkeleton() {
  const { spacing, fontSize } = useTheme();

  return (
    <View accessibilityLabel="Loading recipe" accessible style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={fontSize.md} />
        <Skeleton height={fontSize.md} width="85%" />
      </View>
      <Skeleton height={fontSize.md * 2} width="60%" />
      <View style={{ gap: spacing.md }}>
        <RecipeSectionHeading>Ingredients</RecipeSectionHeading>
        {Array.from({ length: INGREDIENT_COUNT }, (_, index) => (
          <Skeleton height={fontSize.md} key={index} />
        ))}
      </View>
      <View style={{ gap: spacing.md }}>
        <RecipeSectionHeading>Steps</RecipeSectionHeading>
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <View key={index} style={{ gap: spacing.sm }}>
            <Skeleton height={fontSize.md} />
            <Skeleton height={fontSize.md} width="70%" />
          </View>
        ))}
      </View>
    </View>
  );
}

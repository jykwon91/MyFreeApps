import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

const CARD_COUNT = 5;

export default function RecipeListSkeleton() {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View accessibilityLabel="Loading recipes" accessible style={{ gap: spacing.md }}>
      {Array.from({ length: CARD_COUNT }, (_, index) => (
        <View
          key={index}
          style={{
            padding: spacing.lg,
            gap: spacing.sm,
            borderWidth: 1,
            borderRadius: radius.md,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <Skeleton height={fontSize.md} testID="recipe-skeleton-title" width="60%" />
          <Skeleton height={fontSize.sm} />
          <Skeleton height={fontSize.sm} width="85%" />
          <Skeleton height={fontSize.xs} width="45%" />
        </View>
      ))}
    </View>
  );
}

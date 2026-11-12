import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { CardListSkeletonProps } from "../../types/CardListSkeletonProps";

/** A heading and a few cards: the shape of the onboarding steps and the scenario list. */
export default function CardListSkeleton({ rows, accessibilityLabel }: CardListSkeletonProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityState={{ busy: true }} accessible style={{ gap: spacing.md, padding: spacing.lg }}>
      <Skeleton height={fontSize.xl} width="65%" />
      <Skeleton height={fontSize.sm} width="50%" />
      {Array.from({ length: rows }, (_, index) => (
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
          testID="catalog-skeleton-card"
        >
          <Skeleton height={fontSize.md} width="35%" />
          <Skeleton height={fontSize.sm} width="80%" />
        </View>
      ))}
    </View>
  );
}

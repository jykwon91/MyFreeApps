import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import {
  VERSION_VIEW_MESSAGES as MESSAGES,
  VERSION_VIEW_SKELETON_INGREDIENTS,
  VERSION_VIEW_SKELETON_STEPS,
} from "../../constants/versions";
import type { VersionSkeletonProps } from "../../types/VersionSkeletonProps";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";

/** A version while it loads: its number, note and date, its facts, its buttons, ingredients and steps. */
export default function VersionSkeleton({ buttonCount }: VersionSkeletonProps) {
  const { spacing, fontSize } = useTheme();

  return (
    <View accessibilityLabel={MESSAGES.loading} accessible style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={fontSize.xl} width="20%" />
        <Skeleton height={fontSize.sm} width="60%" />
        <Skeleton height={fontSize.xs} width="30%" />
      </View>
      <Skeleton height={fontSize.md * 2} width="60%" />
      {Array.from({ length: buttonCount }, (_, index) => (
        <Skeleton height={MIN_TOUCH_TARGET} key={index} testID="version-skeleton-button" />
      ))}
      <View style={{ gap: spacing.md }}>
        <RecipeSectionHeading>{VERSION_COPY.ingredients}</RecipeSectionHeading>
        {Array.from({ length: VERSION_VIEW_SKELETON_INGREDIENTS }, (_, index) => (
          <Skeleton height={fontSize.md} key={index} testID="version-skeleton-ingredient" />
        ))}
      </View>
      <View style={{ gap: spacing.md }}>
        <RecipeSectionHeading>{VERSION_COPY.steps}</RecipeSectionHeading>
        {Array.from({ length: VERSION_VIEW_SKELETON_STEPS }, (_, index) => (
          <View key={index} style={{ gap: spacing.sm }} testID="version-skeleton-step">
            <Skeleton height={fontSize.md} />
            <Skeleton height={fontSize.md} width="70%" />
          </View>
        ))}
      </View>
    </View>
  );
}

import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DIFF_SKELETON_ROWS, VERSION_DIFF_MESSAGES as MESSAGES } from "../../constants/versions";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import type { VersionDiffSkeletonProps } from "../../types/VersionDiffSkeletonProps";
import DiffSkeletonRow from "./DiffSkeletonRow";

/** The diff's header and both sections while it loads, and the owner's Tweak button. */
export default function VersionDiffSkeleton({ hasTweak }: VersionDiffSkeletonProps) {
  const { spacing, fontSize } = useTheme();

  return (
    <View accessibilityLabel={MESSAGES.loading} accessible style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={fontSize.xl} width="40%" />
        <Skeleton height={fontSize.sm} width="65%" />
      </View>
      {[VERSION_COPY.ingredients, VERSION_COPY.steps].map((title) => (
        <View key={title} style={{ gap: spacing.sm }} testID="diff-skeleton-section">
          <RecipeSectionHeading>{title}</RecipeSectionHeading>
          {Array.from({ length: DIFF_SKELETON_ROWS }, (_, index) => (
            <DiffSkeletonRow key={index} />
          ))}
        </View>
      ))}
      {hasTweak ? <Skeleton height={MIN_TOUCH_TARGET} testID="diff-skeleton-tweak" /> : null}
    </View>
  );
}

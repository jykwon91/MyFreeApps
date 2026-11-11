import { CHIP_HEIGHT, MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVER_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/discoverSkeleton";

/** The kind chip and name, query, schedule and buttons: the same lines as SavedSearchRow. */
export default function SavedSearchSkeletonRow() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID="saved-search-skeleton-row"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Skeleton borderRadius={radius.md} height={CHIP_HEIGHT} width="20%" />
        <Skeleton height={HEIGHTS.title} width="50%" />
      </View>
      <Skeleton height={HEIGHTS.line} width="70%" />
      <View style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
        <Skeleton height={HEIGHTS.line} width="60%" />
      </View>
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
    </View>
  );
}

import { CHIP_HEIGHT, MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVER_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/discoverSkeleton";

/** The chips, title, company, facts, description and two rows of buttons: the same lines as DiscoveredJobCard. */
export default function DiscoveredJobSkeletonCard() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID="discovered-job-skeleton-card"
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton borderRadius={radius.md} height={CHIP_HEIGHT} width="25%" />
        <Skeleton borderRadius={radius.md} height={CHIP_HEIGHT} width="20%" />
      </View>
      <Skeleton height={HEIGHTS.title} width="60%" />
      <Skeleton height={HEIGHTS.line} width="45%" />
      <Skeleton height={HEIGHTS.caption} width="50%" />
      <Skeleton height={HEIGHTS.line} />
      <Skeleton height={HEIGHTS.line} />
      <Skeleton height={HEIGHTS.line} width="80%" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
      </View>
    </View>
  );
}

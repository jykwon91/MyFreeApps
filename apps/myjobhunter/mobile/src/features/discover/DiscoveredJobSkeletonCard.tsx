import { CHIP_HEIGHT, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVER_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/discoverSkeleton";
import type { DiscoveredJobSkeletonCardProps } from "../../types/DiscoveredJobSkeletonCardProps";
import ButtonRowSkeleton from "./ButtonRowSkeleton";

/**
 * The chips, title, company, facts, description and the buttons: the same lines as DiscoveredJobCard.
 * Two rows of triage buttons, or (Dismissed) the dismissal line and one row of Open + Restore.
 */
export default function DiscoveredJobSkeletonCard({ view }: DiscoveredJobSkeletonCardProps) {
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
      {view === "dismissed" ? (
        <>
          <Skeleton height={HEIGHTS.caption} testID="dismissal-summary-skeleton" width="45%" />
          <ButtonRowSkeleton />
        </>
      ) : (
        <>
          <ButtonRowSkeleton />
          <ButtonRowSkeleton />
        </>
      )}
    </View>
  );
}

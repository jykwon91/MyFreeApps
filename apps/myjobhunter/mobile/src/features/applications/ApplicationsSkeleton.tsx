import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { APPLICATION_MESSAGES, APPLICATION_SKELETON_ROWS } from "../../constants/applications";
import ApplicationSkeletonRow from "./ApplicationSkeletonRow";

/** The list header's Add and Sort buttons, then the rows, so nothing moves when the list arrives. */
export default function ApplicationsSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={APPLICATION_MESSAGES.loadingList} accessibilityRole="progressbar" testID="applications-skeleton">
      <View style={{ gap: spacing.md, padding: spacing.lg }} testID="applications-header-skeleton">
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      {APPLICATION_SKELETON_ROWS.map((row) => (
        <ApplicationSkeletonRow key={row} />
      ))}
    </View>
  );
}

import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { WRITE_ACCESS_MESSAGES } from "../../constants/writeAccess";

/** A neutral stand-in while the role is unknown, so a form never flashes before a viewer is turned away. */
export default function WriteAccessSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel={WRITE_ACCESS_MESSAGES.loading} style={{ gap: spacing.md, padding: spacing.lg }} testID="write-access-skeleton">
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </View>
  );
}

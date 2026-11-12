import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** A loading change: its word, then its line. */
export default function DiffSkeletonRow() {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted }}>
      <Skeleton height={fontSize.xs} width="25%" />
      <Skeleton height={fontSize.md} width="70%" />
    </View>
  );
}

import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function ListingSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="40%" />
      <Skeleton height={20} width="30%" />
    </View>
  );
}

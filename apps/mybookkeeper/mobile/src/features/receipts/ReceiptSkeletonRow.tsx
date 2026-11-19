import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function ReceiptSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="70%" />
      <Skeleton height={14} width="45%" />
      <Skeleton height={14} width="35%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}

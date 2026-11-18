import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RECEIPTS_MESSAGES, RECEIPTS_SKELETON_ROWS } from "../../constants/receipts";

export default function ReceiptsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={RECEIPTS_MESSAGES.loading} testID="receipts-skeleton">
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={20} width="55%" />
      </View>
      {RECEIPTS_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={14} width="45%" />
          <Skeleton height={14} width="35%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      ))}
    </LoadingRegion>
  );
}

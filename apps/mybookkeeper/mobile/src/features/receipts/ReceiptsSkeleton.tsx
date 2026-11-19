import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RECEIPTS_MESSAGES, RECEIPTS_SKELETON_ROWS } from "../../constants/receipts";
import ReceiptSkeletonRow from "./ReceiptSkeletonRow";

export default function ReceiptsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={RECEIPTS_MESSAGES.loading} testID="receipts-skeleton">
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={20} width="55%" />
      </View>
      {RECEIPTS_SKELETON_ROWS.map((row) => (
        <ReceiptSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}

import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { TRANSACTION_LIST_MESSAGES } from "../../constants/transactionList";

const ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function TransactionSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, padding: spacing.lg }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Skeleton height={20} width="55%" />
        <Skeleton height={14} width="40%" />
      </View>
      <Skeleton height={20} width={72} />
    </View>
  );
}

export default function TransactionsSkeleton() {
  return (
    <LoadingRegion label={TRANSACTION_LIST_MESSAGES.loading} testID="transactions-skeleton">
      {ROWS.map((row) => (
        <TransactionSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}

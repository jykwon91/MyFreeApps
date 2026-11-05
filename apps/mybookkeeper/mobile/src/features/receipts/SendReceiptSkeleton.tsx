import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RECEIPTS_MESSAGES } from "../../constants/receipts";

/** Mirrors the form: the summary, the two dates, the method, then the two buttons. */
export default function SendReceiptSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={RECEIPTS_MESSAGES.loadingReceipt} accessibilityRole="progressbar" style={{ gap: spacing.lg, padding: spacing.lg }} testID="send-receipt-skeleton">
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={22} width="30%" />
        <Skeleton height={14} width="35%" />
      </View>
      <View style={{ gap: spacing.md }}>
        <Skeleton height={18} width="30%" />
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </View>
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}

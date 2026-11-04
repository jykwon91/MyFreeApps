import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { TENANT_PAYMENT_MESSAGES } from "../../constants/tenantPayments";
import { categoryLabel, displayAmount, isMoneyIn, shortDate, spokenAmount, spokenDate, statusLabel } from "../transactions/transactionDisplay";
import TransactionStatusChip from "../transactions/TransactionStatusChip";

export default function TenantPaymentRow({ payment, rentNote }: { payment: Transaction; rentNote: string | null }) {
  const { colors, spacing, fontSize } = useTheme();
  const payer = payment.payer_name || payment.vendor || TENANT_PAYMENT_MESSAGES.unnamedPayer;
  const category = categoryLabel(payment.category);
  const isApproved = payment.status === "approved";

  return (
    <Pressable
      accessibilityHint={TENANT_PAYMENT_MESSAGES.openHint}
      accessibilityLabel={[payer, category, spokenAmount(payment), spokenDate(payment.transaction_date), isApproved ? null : statusLabel(payment.status).toLowerCase(), rentNote].filter(Boolean).join(", ")}
      accessibilityRole="button"
      onPress={() => router.push(`/transactions/${payment.id}`)}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.muted : undefined })}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>
          {payer}
        </Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: isMoneyIn(payment) ? colors.positiveText : colors.foreground }}>
          {displayAmount(payment)}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {`${shortDate(payment.transaction_date)} · ${category}`}
      </Text>
      {rentNote ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{rentNote}</Text> : null}
      {isApproved ? null : <TransactionStatusChip status={payment.status} />}
    </Pressable>
  );
}

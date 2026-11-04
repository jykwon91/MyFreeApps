import type { RentPaymentApplication } from "@mybookkeeper/api-client/types/rent/rent-payment-application";
import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { partOfAPayment, RENT_MESSAGES } from "../../constants/rent";
import { shortDate, spokenDate, spokenMoney } from "../transactions/transactionDisplay";
import { isMoreThanACent } from "./rentDisplay";

export default function RentChargeApplication({ application }: { application: RentPaymentApplication }) {
  const { colors, spacing, fontSize } = useTheme();
  const isPartOfPayment = isMoreThanACent(Number(application.payment_total) - Number(application.amount));
  const applied = formatCurrency(application.amount);
  const spokenApplied = spokenMoney(Number(application.amount));
  const spokenTotal = spokenMoney(Number(application.payment_total));
  const who = [shortDate(application.paid_on), application.payer_name].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityHint={RENT_MESSAGES.openPaymentHint}
      accessibilityLabel={[spokenDate(application.paid_on), application.payer_name, isPartOfPayment ? partOfAPayment(spokenApplied, spokenTotal) : spokenApplied].filter(Boolean).join(", ")}
      accessibilityRole="button"
      onPress={() => router.push(`/transactions/${application.transaction_id}`)}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: pressed ? colors.muted : undefined })}
    >
      <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.foreground }}>{who}</Text>
      <Text style={{ fontSize: fontSize.sm, fontVariant: ["tabular-nums"], color: colors.foreground }}>
        {isPartOfPayment ? partOfAPayment(applied, formatCurrency(application.payment_total)) : applied}
      </Text>
    </Pressable>
  );
}

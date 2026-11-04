import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { includesDeposits, noPaymentsFrom, PAYMENTS_SHOWN_AT_FIRST, showAllPayments, TENANT_PAYMENT_MESSAGES, totalReceived } from "../../constants/tenantPayments";
import InquirySection from "../inquiries/InquirySection";
import TenantPaymentRow from "./TenantPaymentRow";
import { tenantPaymentTotals } from "./tenantPaymentTotals";

export default function TenantPayments({ applicantId, name }: { applicantId: string; name: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: payments, error, isFetching, refetch } = useListTransactionsQuery({ applicant_id: applicantId, transaction_type: "income" });
  const [isShowingAll, setIsShowingAll] = useState(false);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  if (!payments && isFetching) {
    return (
      <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
        <View accessibilityLabel={TENANT_PAYMENT_MESSAGES.loading} style={{ gap: spacing.sm }}>
          <Skeleton height={24} width="60%" />
          <Skeleton height={56} width="100%" />
          <Skeleton height={56} width="100%" />
        </View>
      </InquirySection>
    );
  }
  if (!payments) {
    return (
      <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
        <Text style={mutedText}>{TENANT_PAYMENT_MESSAGES.couldntLoad}</Text>
        <LoadingButton onPress={() => void refetch()} variant="ghost">
          {TENANT_PAYMENT_MESSAGES.tryAgain}
        </LoadingButton>
      </InquirySection>
    );
  }
  if (payments.length === 0) {
    return (
      <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
        <Text style={mutedText}>{noPaymentsFrom(name)}</Text>
      </InquirySection>
    );
  }

  const { received, deposits } = tenantPaymentTotals(payments);
  const shown = isShowingAll ? payments : payments.slice(0, PAYMENTS_SHOWN_AT_FIRST);
  return (
    <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
      {error ? <Text style={mutedText}>{SHOWING_LAST_LOADED_MESSAGE}</Text> : null}
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{totalReceived(formatCurrency(received))}</Text>
      {deposits !== 0 ? <Text style={mutedText}>{includesDeposits(formatCurrency(deposits))}</Text> : null}
      {shown.map((payment) => (
        <TenantPaymentRow key={payment.id} payment={payment} />
      ))}
      {payments.length > PAYMENTS_SHOWN_AT_FIRST ? (
        <LoadingButton onPress={() => setIsShowingAll(!isShowingAll)} variant="ghost">
          {isShowingAll ? TENANT_PAYMENT_MESSAGES.showFewer : showAllPayments(payments.length)}
        </LoadingButton>
      ) : null}
    </InquirySection>
  );
}

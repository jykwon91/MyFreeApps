import { useGetRentLedgerQuery } from "@mybookkeeper/api-client/store/rentLedgerApi";
import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, LoadingRegion, Skeleton, StaleDataBanner, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { RENT_MESSAGES } from "../../constants/rent";
import { includesDeposits, noPaymentsFrom, PAYMENTS_SHOWN_AT_FIRST, showAllPayments, TENANT_PAYMENT_MESSAGES, totalReceived } from "../../constants/tenantPayments";
import InquirySection from "../inquiries/InquirySection";
import { rentNotesByPayment } from "../rent/rentDisplay";
import TenantPaymentRow from "./TenantPaymentRow";
import { tenantPaymentTotals } from "@mybookkeeper/api-client/utils/tenantPaymentTotals";

export default function TenantPayments({ applicantId, name }: { applicantId: string; name: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: payments, error, isFetching, refetch } = useListTransactionsQuery({ applicant_id: applicantId, transaction_type: "income" });
  const { currentData: ledger, error: ledgerError } = useGetRentLedgerQuery({ applicantId });
  const [isShowingAll, setIsShowingAll] = useState(false);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  if (!payments && isFetching) {
    return (
      <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
        <LoadingRegion label={TENANT_PAYMENT_MESSAGES.loading} style={{ gap: spacing.sm }}>
          <Skeleton height={24} width="60%" />
          <Skeleton height={56} width="100%" />
          <Skeleton height={56} width="100%" />
        </LoadingRegion>
      </InquirySection>
    );
  }
  if (!payments) {
    return (
      <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
        <Text style={mutedText}>{TENANT_PAYMENT_MESSAGES.couldntLoad}</Text>
        <LoadingButton onPress={() => refetch()} variant="ghost">
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
  const rentNotes = ledger ? rentNotesByPayment(ledger) : null;
  const shown = isShowingAll ? payments : payments.slice(0, PAYMENTS_SHOWN_AT_FIRST);
  return (
    <InquirySection title={TENANT_PAYMENT_MESSAGES.section}>
      <StaleDataBanner isShown={Boolean(error)} variant="note" />
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{totalReceived(formatCurrency(received))}</Text>
      {deposits !== 0 ? <Text style={mutedText}>{includesDeposits(formatCurrency(deposits))}</Text> : null}
      {!ledger && ledgerError ? <Text style={mutedText}>{RENT_MESSAGES.couldntLoadApplied}</Text> : null}
      {shown.map((payment) => (
        <TenantPaymentRow key={payment.id} payment={payment} rentNote={rentNotes?.get(payment.id) ?? null} />
      ))}
      {payments.length > PAYMENTS_SHOWN_AT_FIRST ? (
        <LoadingButton accessibilityState={{ expanded: isShowingAll }} onPress={() => setIsShowingAll(!isShowingAll)} variant="ghost">
          {isShowingAll ? TENANT_PAYMENT_MESSAGES.showFewer : showAllPayments(payments.length)}
        </LoadingButton>
      ) : null}
    </InquirySection>
  );
}

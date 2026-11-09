import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { ScrollView, type ScrollViewInstance, Text, View } from "react-native";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import type { ReceiptSendValues } from "../../types/ReceiptSendValues";
import PaymentMethodRow from "./PaymentMethodRow";
import PeriodDateRow from "../shell/PeriodDateRow";
import ReceiptBlockerBanner from "./ReceiptBlockerBanner";
import { blockerMessage, endBeforeStartMessage, gmailMessage, guessedPaymentMethod } from "./receiptDisplay";
import ReceiptGmailBanner from "./ReceiptGmailBanner";
import ReceiptSummary from "./ReceiptSummary";

interface SendReceiptFormProps {
  receipt: PendingReceipt;
  gmailState: ReceiptGmailState;
  isSending: boolean;
  isPreviewing: boolean;
  failure: string | null;
  onSend: (values: ReceiptSendValues) => void;
  onPreview: (values: ReceiptSendValues) => void;
}

export default function SendReceiptForm({ receipt, gmailState, isSending, isPreviewing, failure, onSend, onPreview }: SendReceiptFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [guess] = useState(() => guessedPaymentMethod(receipt));
  const [values, setValues] = useState<ReceiptSendValues>({
    periodStart: receipt.period_start_date,
    periodEnd: receipt.period_end_date,
    paymentMethod: guess,
  });
  const [openDate, setOpenDate] = useState<"start" | "end" | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const isReversed = values.periodStart > values.periodEnd;
  const blocker = receipt.send_blocker;
  const readiness = blocker ? blockerMessage(blocker) : gmailMessage(gmailState);

  // The buttons sit below the form, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0 });
  }, [failure]);

  function update(change: Partial<ReceiptSendValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  function toggle(which: "start" | "end"): void {
    setOpenDate((current) => (current === which ? null : which));
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" ref={scroller} testID="send-receipt-form">
      {/* The readiness banner already says it when a refused send turns out to be one of these. */}
      {failure && failure !== readiness ? <Banner message={failure} /> : null}
      {blocker ? <ReceiptBlockerBanner blocker={blocker} /> : <ReceiptGmailBanner state={gmailState} />}
      <ReceiptSummary receipt={receipt} />

      <View pointerEvents={isSending ? "none" : "auto"} style={{ gap: spacing.md }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{MESSAGES.rentPeriod}</Text>
        <PeriodDateRow
          isOpen={openDate === "start"}
          label={MESSAGES.from}
          onChange={(periodStart) => update({ periodStart })}
          onToggle={() => toggle("start")}
          value={values.periodStart}
        />
        <PeriodDateRow
          isOpen={openDate === "end"}
          label={MESSAGES.to}
          minimum={values.periodStart}
          onChange={(periodEnd) => update({ periodEnd })}
          onToggle={() => toggle("end")}
          value={values.periodEnd}
        />
        {isReversed ? (
          <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
            {endBeforeStartMessage(values.periodStart)}
          </Text>
        ) : null}
        <PaymentMethodRow guess={guess} onChange={(paymentMethod) => update({ paymentMethod })} value={values.paymentMethod} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <LoadingButton disabled={isReversed || isSending} isLoading={isPreviewing} loadingText={MESSAGES.previewing} onPress={() => onPreview(values)} variant="secondary">
          {MESSAGES.previewPdf}
        </LoadingButton>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.previewHint}</Text>
      </View>
      <LoadingButton disabled={isReversed || readiness !== null} isLoading={isSending} loadingText={MESSAGES.sending} onPress={() => onSend(values)}>
        {MESSAGES.sendReceipt}
      </LoadingButton>
    </ScrollView>
  );
}

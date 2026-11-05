import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { blockerMessage } from "./receiptDisplay";

/** Why Send is off for one receipt. An unlinked payment is fixed in Payment Review, which is on the phone. */
export default function ReceiptBlockerNote({ blocker }: { blocker: ReceiptSendBlocker }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{blockerMessage(blocker)}</Text>
      {blocker === "not_attributed" ? (
        <LoadingButton onPress={() => router.push("/payment-review")} variant="secondary">
          {MESSAGES.openPaymentReview}
        </LoadingButton>
      ) : null}
    </View>
  );
}

import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { blockerAction, blockerMessage } from "./receiptDisplay";

/** Why Send is off for one receipt, with the way to fix it on the phone when there is one. */
export default function ReceiptBlockerNote({ blocker, receipt }: { blocker: ReceiptSendBlocker; receipt: PendingReceipt }) {
  const { colors, spacing, fontSize } = useTheme();
  const action = blockerAction(blocker, receipt);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{blockerMessage(blocker)}</Text>
      {action ? (
        <LoadingButton onPress={() => router.push(action.href)} variant="secondary">
          {action.label}
        </LoadingButton>
      ) : null}
    </View>
  );
}

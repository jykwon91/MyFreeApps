import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";
import { Banner } from "@platform/mobile";
import { router } from "expo-router";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { blockerMessage } from "./receiptDisplay";

/** Why this receipt can't go. An unlinked payment is fixed in Payment Review, which is on the phone. */
export default function ReceiptBlockerBanner({ blocker }: { blocker: ReceiptSendBlocker }) {
  return (
    <Banner
      actions={blocker === "not_attributed" ? [{ label: MESSAGES.openPaymentReview, onPress: () => router.push("/payment-review") }] : []}
      message={blockerMessage(blocker)}
    />
  );
}

import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";
import { Banner } from "@platform/mobile";
import { router } from "expo-router";
import { blockerAction, blockerMessage } from "./receiptDisplay";

/** Why this receipt can't go, with the way to fix it on the phone when there is one. */
export default function ReceiptBlockerBanner({ blocker, receipt }: { blocker: ReceiptSendBlocker; receipt: PendingReceipt }) {
  const action = blockerAction(blocker, receipt);
  return <Banner actions={action ? [{ label: action.label, onPress: () => router.push(action.href) }] : []} message={blockerMessage(blocker)} />;
}

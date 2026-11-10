import { router } from "expo-router";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import RequireWrite from "../workspace/RequireWrite";
import SendReceiptLoader from "./SendReceiptLoader";
import SendReceiptSkeleton from "./SendReceiptSkeleton";

/** Sends a rent receipt. A viewer is told they can't, and the pending list isn't fetched for them. */
export default function SendReceiptScreen({ transactionId }: { transactionId: string }) {
  return (
    <RequireWrite action={{ label: MESSAGES.goBack, onPress: () => router.back() }} body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} loading={<SendReceiptSkeleton />}>
      <SendReceiptLoader transactionId={transactionId} />
    </RequireWrite>
  );
}

import { useGetPendingReceiptQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { EmptyState, goBackOr } from "@platform/mobile";
import { usePreventRemove } from "expo-router";
import { useEffect } from "react";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import SendReceiptForm from "./SendReceiptForm";
import SendReceiptSkeleton from "./SendReceiptSkeleton";
import { useReceiptPreview } from "./useReceiptPreview";
import { useSendReceipt } from "./useSendReceipt";

export default function SendReceiptLoader({ transactionId }: { transactionId: string }) {
  // Looked up by its payment, so a receipt opens wherever it sits in the list.
  const { currentData, isFetching, refetch } = useGetPendingReceiptQuery(transactionId);
  const { isSending, failure, finished, askToSend } = useSendReceipt(async () => {
    try {
      const latest = await refetch();
      return latest.isError ? null : (latest.data ?? null);
    } catch {
      // Refetching throws once the screen has gone, and then there's no answer either.
      return null;
    }
  });
  const { isPreviewing, preview } = useReceiptPreview(() => refetch().unwrap());

  // Leaving mid-send would hide whether it went.
  usePreventRemove(isSending && !finished, () => undefined);

  // Leaving has to wait a render, or the guard above still refuses it.
  useEffect(() => {
    if (finished) goBackOr("/receipts");
  }, [finished]);

  const goBack = { label: MESSAGES.goBack, onPress: () => goBackOr("/receipts") };
  if (!currentData) {
    if (isFetching) return <SendReceiptSkeleton />;
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: () => refetch() }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }
  const receipt = finished ?? currentData.item;
  if (!receipt) return <EmptyState action={goBack} body={MESSAGES.notWaitingBody} heading={MESSAGES.notWaitingHeading} />;

  return (
    <SendReceiptForm
      failure={failure}
      gmailState={currentData.gmail_state}
      isPreviewing={isPreviewing}
      isSending={isSending}
      key={receipt.transaction_id}
      onPreview={(values) => void preview(receipt, values)}
      onSend={(values) => askToSend(receipt, values)}
      receipt={receipt}
    />
  );
}

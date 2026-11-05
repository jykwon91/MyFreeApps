import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { EmptyState } from "@platform/mobile";
import { router, usePreventRemove } from "expo-router";
import { useEffect } from "react";
import { RECEIPTS_LIMIT, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { useCanWrite } from "../workspace/useCanWrite";
import SendReceiptForm from "./SendReceiptForm";
import SendReceiptSkeleton from "./SendReceiptSkeleton";
import { useReceiptPreview } from "./useReceiptPreview";
import { useSendReceipt } from "./useSendReceipt";

export default function SendReceiptScreen({ transactionId }: { transactionId: string }) {
  const canWrite = useCanWrite();
  // The same list the Receipts screen loads, so its rows open with nothing to wait for.
  const { currentData, isFetching, refetch } = useGetPendingReceiptsQuery({ limit: RECEIPTS_LIMIT });
  const { isSending, failure, finished, askToSend } = useSendReceipt(async () => {
    try {
      const latest = await refetch();
      return latest.isError ? null : (latest.data ?? null);
    } catch {
      // Refetching throws once the screen has gone, and then there's no list either.
      return null;
    }
  });
  const { isPreviewing, preview } = useReceiptPreview(() => refetch().unwrap());

  // Leaving mid-send would hide whether it went.
  usePreventRemove(isSending && !finished, () => undefined);

  // Leaving has to wait a render, or the guard above still refuses it.
  useEffect(() => {
    if (finished) router.back();
  }, [finished]);

  const goBack = { label: MESSAGES.goBack, onPress: () => router.back() };
  if (!canWrite) return <EmptyState action={goBack} body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} />;
  if (!currentData) {
    if (isFetching) return <SendReceiptSkeleton />;
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }
  const receipt = finished ?? currentData.items.find((item) => item.transaction_id === transactionId);
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

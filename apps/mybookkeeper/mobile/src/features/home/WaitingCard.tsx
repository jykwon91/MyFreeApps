import { useGetAttributionReviewQueueQuery } from "@mybookkeeper/api-client/store/attributionApi";
import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { useGetDuplicatesQuery, useGetTransactionReviewCountQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { DUPLICATES_LINK } from "../../constants/duplicates";
import { DOCUMENTS_NEEDING_A_LOOK_LINK, HOME_PAYMENT_REVIEW_ARGS, HOME_RECEIPTS_ARGS, PAYMENT_REVIEW_LINK, RECEIPTS_LINK } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { duplicateCountLine } from "../duplicates/duplicateDisplay";
import { needsALook } from "../documents/documentDisplay";
import { useDocumentsWithPolling } from "../documents/useDocumentsWithPolling";
import { transactionsLink } from "../transactions/transactionFilters";
import { useCanWrite } from "../workspace/useCanWrite";
import HomeCard from "./HomeCard";
import { documentsWaiting, paymentsWaiting, receiptsWaiting, transactionsWaiting, waitingFailedMessage } from "./homeDisplay";
import HomeLinkRow from "./HomeLinkRow";
import HomeSectionError from "./HomeSectionError";

export default function WaitingCard() {
  const { colors, spacing, fontSize } = useTheme();
  const reviewCount = useGetTransactionReviewCountQuery();
  const documents = useDocumentsWithPolling();
  // Only worth a row when there are some: failing to find out is no reason to hold up the rest.
  const duplicates = useGetDuplicatesQuery();
  // A viewer can't send receipts, so they aren't waiting on them.
  const canWrite = useCanWrite();
  const receipts = useGetPendingReceiptsQuery(HOME_RECEIPTS_ARGS, { skip: !canWrite });
  // Matching a payment to a tenant is a write, so a viewer isn't waiting on it either.
  const payments = useGetAttributionReviewQueueQuery(HOME_PAYMENT_REVIEW_ARGS, { skip: !canWrite });

  const paymentCount = canWrite ? payments.data?.pending_count : 0;
  const transactionCount = reviewCount.data?.count;
  const documentCount = documents.data?.filter(needsALook).length;
  const receiptCount = canWrite ? receipts.data?.pending_count : 0;
  const duplicateCount = duplicates.data?.pairs.length ?? 0;
  const failedMessage = waitingFailedMessage({
    transactions: reviewCount.isError && !reviewCount.data,
    documents: documents.isError && !documents.data,
    receipts: canWrite && receipts.isError && !receipts.data,
    payments: canWrite && payments.isError && !payments.data,
  });

  async function retry(): Promise<void> {
    await Promise.all([reviewCount.refetch(), documents.refetch(), duplicates.refetch(), canWrite ? payments.refetch() : undefined, canWrite ? receipts.refetch() : undefined]);
  }

  return (
    <HomeCard title="Waiting for you">
      {(reviewCount.isLoading && documents.isLoading) ||
      (canWrite && receipts.isLoading && !transactionCount && !documentCount) ||
      (canWrite && payments.isLoading && !transactionCount && !documentCount && !receiptCount) ||
      (duplicates.isLoading && !transactionCount && !documentCount && !receiptCount && !paymentCount) ? (
        <View accessibilityLabel="Loading what's waiting for you" accessible style={{ gap: spacing.sm }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={20} width="50%" />
        </View>
      ) : transactionCount === 0 && documentCount === 0 && receiptCount === 0 && paymentCount === 0 && duplicateCount === 0 ? (
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>You're all caught up.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {transactionCount ? (
            <HomeLinkRow
              label={transactionsWaiting(transactionCount)}
              onPress={() => router.navigate(transactionsLink({ ...NO_FILTERS, view: "review" }))}
            />
          ) : null}
          {documentCount ? (
            <HomeLinkRow label={documentsWaiting(documentCount)} onPress={() => router.navigate(DOCUMENTS_NEEDING_A_LOOK_LINK)} />
          ) : null}
          {receiptCount ? <HomeLinkRow label={receiptsWaiting(receiptCount)} onPress={() => router.navigate(RECEIPTS_LINK)} /> : null}
          {paymentCount ? <HomeLinkRow label={paymentsWaiting(paymentCount)} onPress={() => router.navigate(PAYMENT_REVIEW_LINK)} /> : null}
          {duplicateCount ? <HomeLinkRow label={duplicateCountLine(duplicateCount)} onPress={() => router.navigate(DUPLICATES_LINK)} /> : null}
          {failedMessage ? <HomeSectionError message={failedMessage} onRetry={retry} /> : null}
        </View>
      )}
    </HomeCard>
  );
}

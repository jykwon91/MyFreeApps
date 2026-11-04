import {
  useGetTransactionReviewCountQuery,
  useListTransactionPagesInfiniteQuery,
  useUpdateTransactionMutation,
} from "@mybookkeeper/api-client/store/transactionsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { skipToken } from "@reduxjs/toolkit/query";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { nextToReview } from "./nextToReview";
import { isWholeReviewQueue } from "./transactionFilters";
import { approveFailureMessage, othersUpdatedSentence } from "./transactionMessages";

/** Approving, and in review mode moving on to the next one still waiting in the same list. */
export function useApproveTransaction(id: string, queueParams: TransactionListParams | null) {
  const { showToast } = useToast();
  const [updateTransaction] = useUpdateTransactionMutation();
  const [isApproving, setIsApproving] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const isReview = queueParams !== null;
  const queue = useListTransactionPagesInfiniteQuery(queueParams ?? skipToken);
  // The count covers everything waiting, so it only describes an unfiltered list.
  const showsCount = isReview && isWholeReviewQueue(queueParams);
  const count = useGetTransactionReviewCountQuery(undefined, { skip: !showsCount });
  const queueRows = useMemo<Transaction[]>(() => queue.data?.pages.flat() ?? [], [queue.data]);

  async function moveToNext(lead: string, others = ""): Promise<void> {
    const refreshed = await queue.refetch();
    const remaining = refreshed.data?.pages.flat() ?? queueRows.filter((row) => row.id !== id);
    const next = nextToReview(queueRows, remaining, id);
    if (next === null) {
      showToast(`${lead}That's the last one.${others}`);
      router.back();
      return;
    }
    router.setParams({ id: next });
    if (showsCount) {
      const refreshedCount = await count.refetch();
      showToast(`${lead}${refreshedCount.data?.count ?? remaining.length} left to review.${others}`);
    } else if (lead || others) {
      showToast(`${lead}${others}`.trim());
    }
  }

  async function approve(propertyId?: string): Promise<void> {
    setIsApproving(true);
    try {
      const data: Partial<Transaction> = { status: "approved" };
      if (propertyId) data.property_id = propertyId;
      const result = await updateTransaction({ id, data }).unwrap();
      const others = othersUpdatedSentence(result, result.vendor);
      if (isReview) await moveToNext("Approved. ", others);
      else showToast(`Approved.${others}`);
    } catch (error) {
      showToast(approveFailureMessage(error), "error");
    } finally {
      setIsApproving(false);
    }
  }

  async function goToNext(): Promise<void> {
    setIsAdvancing(true);
    try {
      await moveToNext("");
    } finally {
      setIsAdvancing(false);
    }
  }

  return {
    approve,
    goToNext,
    isAdvancing,
    isApproving,
    queueRow: queueRows.find((row) => row.id === id),
    waitingCount: showsCount ? count.data?.count : undefined,
  };
}

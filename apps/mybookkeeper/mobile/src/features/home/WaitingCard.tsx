import { useGetTransactionReviewCountQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { DOCUMENTS_NEEDING_A_LOOK_LINK } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { needsALook } from "../documents/documentDisplay";
import { useDocumentsWithPolling } from "../documents/useDocumentsWithPolling";
import { transactionsLink } from "../transactions/transactionFilters";
import HomeCard from "./HomeCard";
import { documentsWaiting, transactionsWaiting, waitingFailedMessage } from "./homeDisplay";
import HomeLinkRow from "./HomeLinkRow";
import HomeSectionError from "./HomeSectionError";

export default function WaitingCard() {
  const { colors, spacing, fontSize } = useTheme();
  const reviewCount = useGetTransactionReviewCountQuery();
  const documents = useDocumentsWithPolling();

  const transactionCount = reviewCount.data?.count;
  const documentCount = documents.data?.filter(needsALook).length;
  const transactionsFailed = reviewCount.isError && !reviewCount.data;
  const documentsFailed = documents.isError && !documents.data;
  const failedMessage = waitingFailedMessage(transactionsFailed, documentsFailed);

  async function retry(): Promise<void> {
    await Promise.all([reviewCount.refetch(), documents.refetch()]);
  }

  return (
    <HomeCard title="Waiting for you">
      {reviewCount.isLoading && documents.isLoading ? (
        <View accessibilityLabel="Loading what's waiting for you" accessible style={{ gap: spacing.sm }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={20} width="50%" />
        </View>
      ) : transactionCount === 0 && documentCount === 0 ? (
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
          {failedMessage ? <HomeSectionError message={failedMessage} onRetry={retry} /> : null}
        </View>
      )}
    </HomeCard>
  );
}

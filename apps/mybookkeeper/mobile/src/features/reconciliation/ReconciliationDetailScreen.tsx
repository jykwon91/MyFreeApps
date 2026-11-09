import {
  RECONCILIATION_DELETE_MESSAGES as DELETE,
  reconciliationDeleteLabel,
} from "@mybookkeeper/api-client/constants/reconciliationDelete";
import { useListSourcesQuery } from "@mybookkeeper/api-client/store/reconciliationApi";
import { Banner, EmptyState, LoadingButton, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import InquiryChip from "../inquiries/InquiryChip";
import TransactionFact from "../transactions/TransactionFact";
import { useCanWrite } from "../workspace/useCanWrite";
import { detailLabel, differenceText, recordsTotalText, sourceTitle, sourceTypeLabel, statusWord } from "./reconciliationDisplay";
import { useDeleteReconciliationSource } from "./useDeleteReconciliationSource";
import { formatCurrency } from "@platform/core/utils/currency";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";

function ReconciliationDetailBody({ source, canWrite }: { source: ReconciliationSource; canWrite: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  const { isDeleting, askToDelete } = useDeleteReconciliationSource(source, () => router.back());
  return (
    <>
      <View accessible accessibilityLabel={detailLabel(source)} style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {sourceTitle(source)}
        </Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: "700", fontVariant: ["tabular-nums"], color: colors.foreground }}>
          {formatCurrency(Number(source.reported_amount))}
        </Text>
        <InquiryChip label={statusWord(source.status)} />
      </View>
      <TransactionFact label={MESSAGES.fileType} value={sourceTypeLabel(source.source_type)} />
      <TransactionFact label={MESSAGES.fileIssuer} value={source.issuer ?? MESSAGES.notCompared} />
      <TransactionFact label={MESSAGES.fileDocument} value={source.document_file_name ?? MESSAGES.notCompared} />
      <TransactionFact label={MESSAGES.fileProperty} value={source.property_name ?? MESSAGES.notCompared} />
      <TransactionFact label={MESSAGES.fileReported} value={formatCurrency(Number(source.reported_amount))} />
      <TransactionFact label={MESSAGES.fileInRecords} value={recordsTotalText(source)} />
      <TransactionFact label={MESSAGES.fileDifference} value={differenceText(source)} />
      {recordsTotalText(source) === MESSAGES.notCompared ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.notCompareYet}</Text>
      ) : null}
      {source.document_id ? (
        <LoadingButton onPress={() => router.push(`/documents/${source.document_id}`)} variant="secondary">
          {MESSAGES.openSourceDocument}
        </LoadingButton>
      ) : null}
      {canWrite ? (
        <LoadingButton
          accessibilityHint={DELETE.hint}
          accessibilityLabel={reconciliationDeleteLabel(source.issuer)}
          isLoading={isDeleting}
          loadingText={DELETE.deleting}
          onPress={askToDelete}
          variant="destructive"
        >
          {DELETE.action}
        </LoadingButton>
      ) : null}
    </>
  );
}

export default function ReconciliationDetailScreen({ id, year }: { id: string; year: number }) {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useListSourcesQuery({ tax_year: year });
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!currentData) {
    if (isFetching || !error) {
      return (
        <View accessibilityLabel={MESSAGES.detailLoading} style={{ gap: spacing.md, padding: spacing.lg }} testID="reconciliation-detail-skeleton">
          <Skeleton height={28} width="60%" />
          <Skeleton height={40} width="40%" />
          <Skeleton height={200} />
        </View>
      );
    }
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: async () => void (await refetch()) }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }

  const source = currentData.find((candidate) => candidate.id === id);
  if (!source) {
    return <EmptyState action={{ label: MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.detailGoneBody} heading={MESSAGES.detailGone} />;
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
      testID="reconciliation-detail"
    >
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <ReconciliationDetailBody canWrite={canWrite} source={source} />
    </ScrollView>
  );
}

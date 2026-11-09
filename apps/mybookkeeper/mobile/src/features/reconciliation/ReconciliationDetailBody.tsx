import {
  RECONCILIATION_DELETE_MESSAGES as DELETE,
  reconciliationDeleteLabel,
} from "@mybookkeeper/api-client/constants/reconciliationDelete";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import type { ReconciliationDetailBodyProps } from "../../types/ReconciliationDetailBodyProps";
import InquiryChip from "../inquiries/InquiryChip";
import TransactionFact from "../transactions/TransactionFact";
import { detailLabel, differenceText, recordsTotalText, sourceTitle, sourceTypeLabel, statusWord } from "./reconciliationDisplay";
import { useDeleteReconciliationSource } from "./useDeleteReconciliationSource";

export default function ReconciliationDetailBody({ source, canWrite }: ReconciliationDetailBodyProps) {
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

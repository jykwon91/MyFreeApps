import {
  MARK_CAPITAL_IMPROVEMENT,
  MARKING_CAPITAL_IMPROVEMENT,
  UNMARK_CAPITAL_IMPROVEMENT,
  UNMARKING_CAPITAL_IMPROVEMENT,
} from "@mybookkeeper/api-client/constants/capitalImprovementLabels";
import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TRANSACTION_SELECTION_MESSAGES as SELECTION_MESSAGES } from "../../constants/transactionSelection";
import type { TransactionSelectionBarProps } from "../../types/TransactionSelectionBarProps";
import { BULK_TRANSACTION_MESSAGES } from "./transactionMessages";

/** Sticks to the bottom while picking several, so Delete and Approve are always under the thumb. */
export default function TransactionSelectionBar({
  selectedCount,
  approvableCount,
  isApproving,
  isDeleting,
  isMarking,
  isUnmarking,
  isChecking,
  onApprove,
  onMarkCapital,
  onUnmarkCapital,
  onDelete,
  onCancel,
}: TransactionSelectionBarProps) {
  const { colors, spacing, fontSize } = useTheme();
  const cannotApprove = selectedCount - approvableCount;
  const isBusy = isApproving || isDeleting || isMarking || isUnmarking;
  const status = isChecking ? SELECTION_MESSAGES.checking : selectedCount === 1 ? "1 selected" : `${selectedCount} selected`;
  useAnnouncement(status, "polite");
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{status}</Text>
      {cannotApprove > 0 && !isChecking ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {cannotApprove === 1 ? "1 of these" : `${cannotApprove} of these`} can&apos;t be approved here: it has no property, or it&apos;s already approved.
        </Text>
      ) : null}
      {/* Cancel sits above the pair so "Approving…" and "Deleting…" keep a full half of a 375px screen each. */}
      <LoadingButton accessibilityLabel="Stop selecting" disabled={isBusy} onPress={onCancel} variant="secondary">
          Cancel
      </LoadingButton>
      <View style={{ flexDirection: "row", gap: spacing.sm }} testID="bulk-action-row">
        <LoadingButton
          accessibilityLabel={`Delete ${selectedCount} selected`}
          disabled={selectedCount === 0 || (isBusy && !isDeleting) || isChecking}
          isLoading={isDeleting}
          loadingText={BULK_TRANSACTION_MESSAGES.deleting}
          onPress={onDelete}
          style={{ flex: 1 }}
          variant="destructive"
        >
          {BULK_TRANSACTION_MESSAGES.delete}
        </LoadingButton>
        <LoadingButton
          accessibilityLabel={`Approve ${approvableCount} selected`}
          disabled={approvableCount === 0 || (isBusy && !isApproving) || isChecking}
          isLoading={isApproving}
          loadingText={BULK_TRANSACTION_MESSAGES.approving}
          onPress={onApprove}
          style={{ flex: 1 }}
        >
          Approve
        </LoadingButton>
      </View>
      {/* Income is skipped by the server and counted in the result, as on the website. */}
      <View style={{ flexDirection: "row", gap: spacing.sm }} testID="bulk-capital-row">
        <LoadingButton
          accessibilityLabel={`${MARK_CAPITAL_IMPROVEMENT}, ${selectedCount} selected`}
          disabled={selectedCount === 0 || (isBusy && !isMarking) || isChecking}
          isLoading={isMarking}
          loadingText={MARKING_CAPITAL_IMPROVEMENT}
          onPress={onMarkCapital}
          style={{ flex: 2 }}
          variant="secondary"
        >
          {MARK_CAPITAL_IMPROVEMENT}
        </LoadingButton>
        <LoadingButton
          accessibilityLabel={`${UNMARK_CAPITAL_IMPROVEMENT} capital improvement, ${selectedCount} selected`}
          disabled={selectedCount === 0 || (isBusy && !isUnmarking) || isChecking}
          isLoading={isUnmarking}
          loadingText={UNMARKING_CAPITAL_IMPROVEMENT}
          onPress={onUnmarkCapital}
          style={{ flex: 1 }}
          variant="secondary"
        >
          {UNMARK_CAPITAL_IMPROVEMENT}
        </LoadingButton>
      </View>
    </View>
  );
}

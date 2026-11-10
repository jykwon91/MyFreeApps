import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { TransactionSelectionBarProps } from "../../types/TransactionSelectionBarProps";
import { BULK_TRANSACTION_MESSAGES } from "./transactionMessages";

/** Sticks to the bottom while picking several, so Delete and Approve are always under the thumb. */
export default function TransactionSelectionBar({
  selectedCount,
  approvableCount,
  isApproving,
  isDeleting,
  onApprove,
  onDelete,
  onCancel,
}: TransactionSelectionBarProps) {
  const { colors, spacing, fontSize } = useTheme();
  const cannotApprove = selectedCount - approvableCount;
  const isBusy = isApproving || isDeleting;
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
      <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {selectedCount === 1 ? "1 selected" : `${selectedCount} selected`}
      </Text>
      {cannotApprove > 0 ? (
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
          disabled={selectedCount === 0 || isApproving}
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
          disabled={approvableCount === 0 || isDeleting}
          isLoading={isApproving}
          loadingText={BULK_TRANSACTION_MESSAGES.approving}
          onPress={onApprove}
          style={{ flex: 1 }}
        >
          Approve
        </LoadingButton>
      </View>
    </View>
  );
}

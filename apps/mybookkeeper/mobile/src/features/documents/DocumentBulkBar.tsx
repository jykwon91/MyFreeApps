import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DOCUMENT_BULK_MESSAGES as MESSAGES, deleteSelectedLabel } from "../../constants/documentBulk";

/** Sticks to the bottom while picking several, so Delete is always under the thumb. */
export default function DocumentBulkBar({
  selectedCount,
  isChecking,
  isDeleting,
  onDelete,
}: {
  selectedCount: number;
  /** Waits for the check of which ticked documents are still shown, so it never sends a hidden one. */
  isChecking: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
      <LoadingButton
        accessibilityLabel={deleteSelectedLabel(selectedCount)}
        disabled={selectedCount === 0 || isChecking}
        isLoading={isDeleting}
        loadingText={MESSAGES.deleting}
        onPress={onDelete}
        variant="destructive"
      >
        {MESSAGES.delete}
      </LoadingButton>
    </View>
  );
}

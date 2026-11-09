import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DOCUMENT_BULK_MESSAGES as MESSAGES, deleteSelectedLabel } from "../../constants/documentBulk";

/** Sticks to the bottom while picking several, so Delete is always under the thumb. */
export default function DocumentBulkBar({
  selectedCount,
  isDeleting,
  onDelete,
}: {
  selectedCount: number;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
      <LoadingButton
        accessibilityLabel={deleteSelectedLabel(selectedCount)}
        disabled={selectedCount === 0}
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

import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DOCUMENT_BULK_MESSAGES as MESSAGES, selectedCountLabel, stillBeingReadNote } from "../../constants/documentBulk";

/** The top of the list while picking several: how many, and a way to take every matching one (loaded or not) or stop. */
export default function DocumentSelectionHeader({
  selectedCount,
  selectableCount,
  unselectableCount,
  hiddenNote,
  isChecking,
  isSelectingAll,
  isBusy,
  onSelectAll,
  onCancel,
}: {
  selectedCount: number;
  /** What Select all would tick: every matching document that has finished being read. Undefined until known. */
  selectableCount: number | undefined;
  unselectableCount: number;
  hiddenNote: string | null;
  /** Some ticks wait on a check of which documents the search and filters still show. */
  isChecking: boolean;
  isSelectingAll: boolean;
  isBusy: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const countLabel = isChecking ? MESSAGES.checking : selectedCountLabel(selectedCount);
  useAnnouncement(countLabel);
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {countLabel}
        </Text>
        <LoadingButton
          accessibilityLabel={MESSAGES.selectAllLabel}
          disabled={isBusy || selectedCount === selectableCount}
          isLoading={isSelectingAll}
          loadingText={MESSAGES.selectingAll}
          onPress={onSelectAll}
          variant="secondary"
        >
          {MESSAGES.selectAll}
        </LoadingButton>
        <LoadingButton accessibilityLabel={MESSAGES.cancelLabel} disabled={isBusy} onPress={onCancel} variant="secondary">
          {MESSAGES.cancel}
        </LoadingButton>
      </View>
      {unselectableCount > 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{stillBeingReadNote(unselectableCount)}</Text>
      ) : null}
      {hiddenNote ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{hiddenNote}</Text> : null}
    </View>
  );
}

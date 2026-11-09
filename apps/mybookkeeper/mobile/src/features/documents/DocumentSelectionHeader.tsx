import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { cappedSelectNote } from "../../constants/documents";
import { DOCUMENT_BULK_MESSAGES as MESSAGES, selectedCountLabel, stillBeingReadNote } from "../../constants/documentBulk";

/** The top of the list while picking several: how many, and a way to take every one shown or stop. */
export default function DocumentSelectionHeader({
  selectedCount,
  selectableCount,
  unselectableCount,
  hiddenNote,
  isCapped,
  isBusy,
  onSelectAll,
  onCancel,
}: {
  selectedCount: number;
  /** What Select all would tick: every document shown that has finished being read. */
  selectableCount: number;
  unselectableCount: number;
  hiddenNote: string | null;
  isCapped: boolean;
  isBusy: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  useAnnouncement(selectedCountLabel(selectedCount));
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {selectedCountLabel(selectedCount)}
        </Text>
        <LoadingButton
          accessibilityLabel={MESSAGES.selectAllLabel}
          disabled={isBusy || selectedCount === selectableCount}
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
      {isCapped ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{cappedSelectNote()}</Text> : null}
    </View>
  );
}

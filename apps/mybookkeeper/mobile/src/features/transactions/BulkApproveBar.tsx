import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

/** Sticks to the bottom while picking several, so Approve is always under the thumb. */
export default function BulkApproveBar({
  selectedCount,
  approvableCount,
  isApproving,
  onApprove,
  onCancel,
}: {
  selectedCount: number;
  approvableCount: number;
  isApproving: boolean;
  onApprove: () => Promise<void>;
  onCancel: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const cannotApprove = selectedCount - approvableCount;
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
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton accessibilityLabel="Stop selecting" disabled={isApproving} onPress={onCancel} style={{ flex: 1 }} variant="secondary">
          Cancel
        </LoadingButton>
        <LoadingButton
          accessibilityLabel={`Approve ${approvableCount} selected`}
          disabled={approvableCount === 0}
          isLoading={isApproving}
          loadingText="Approving…"
          onPress={onApprove}
          style={{ flex: 2 }}
        >
          Approve
        </LoadingButton>
      </View>
    </View>
  );
}

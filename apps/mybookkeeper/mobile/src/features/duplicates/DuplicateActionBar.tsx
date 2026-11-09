import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import type { DuplicateAction } from "../../types/DuplicateAction";

/** Sticks to the bottom, so the decision is always under the thumb however long the comparison is. */
export default function DuplicateActionBar({
  busy,
  onMerge,
  onDismiss,
}: {
  busy: DuplicateAction | null;
  onMerge: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.lg,
        paddingBottom: spacing.lg + insets.bottom,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <LoadingButton
        accessibilityLabel="Mark these two as not duplicates"
        disabled={busy !== null}
        isLoading={busy === "dismiss"}
        loadingText={MESSAGES.dismissing}
        onPress={onDismiss}
        style={{ flex: 1 }}
        variant="secondary"
      >
        {MESSAGES.dismiss}
      </LoadingButton>
      <LoadingButton
        accessibilityLabel="Merge these two into one transaction"
        disabled={busy !== null}
        isLoading={busy === "merge"}
        loadingText={MESSAGES.merging}
        onPress={onMerge}
        style={{ flex: 1 }}
      >
        {MESSAGES.merge}
      </LoadingButton>
    </View>
  );
}

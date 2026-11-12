import { COMPARE_VERSION_COUNT } from "@myrecipes/api-client/constants/versions";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../../constants/versions";
import type { CompareBarProps } from "../../types/CompareBarProps";

/** Starts picking two versions to compare, then opens their diff once exactly two are picked. */
export default function CompareBar({ isComparing, pickedCount, onStart, onCancel, onCompare }: CompareBarProps) {
  const { colors, spacing, fontSize } = useTheme();

  if (!isComparing) {
    return (
      <LoadingButton onPress={onStart} variant="secondary">
        {MESSAGES.startCompare}
      </LoadingButton>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        {MESSAGES.pickTwo(pickedCount)}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton onPress={onCancel} style={{ flex: 1 }} variant="secondary">
          {MESSAGES.cancelCompare}
        </LoadingButton>
        <LoadingButton
          accessibilityHint={MESSAGES.compareHint}
          disabled={pickedCount !== COMPARE_VERSION_COUNT}
          onPress={onCompare}
          style={{ flex: 1 }}
        >
          {MESSAGES.compare}
        </LoadingButton>
      </View>
    </View>
  );
}

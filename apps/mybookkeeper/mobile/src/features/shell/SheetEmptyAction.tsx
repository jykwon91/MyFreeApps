import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { SheetEmptyActionProps } from "../../types/SheetEmptyActionProps";

/** An empty picker that says what to add first, with the way to add it. */
export default function SheetEmptyAction({ message, actionLabel, onPress }: SheetEmptyActionProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{message}</Text>
      <LoadingButton onPress={onPress} variant="secondary">
        {actionLabel}
      </LoadingButton>
    </View>
  );
}

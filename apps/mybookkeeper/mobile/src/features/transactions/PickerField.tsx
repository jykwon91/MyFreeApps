import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";

export default function PickerField({ label, value, hint, onPress, disabled = false }: { label: string; value: string; hint?: string; onPress: () => void; disabled?: boolean }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable accessibilityState={{ disabled }} disabled={disabled} accessibilityHint={hint} accessibilityLabel={`${label}, ${value}`} accessibilityRole="button" onPress={onPress} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      <Text
        style={{
          minHeight: MIN_TOUCH_TARGET,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          fontSize: fontSize.md,
          color: colors.foreground,
        }}
      >
        {value}
      </Text>
      {hint ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{hint}</Text> : null}
    </Pressable>
  );
}

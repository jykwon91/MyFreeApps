import { Text, TextInput, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { FormFieldProps } from "../types/FormFieldProps";

export default function FormField({
  label,
  error,
  hint,
  required = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  ...inputProps
}: FormFieldProps) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "500" }}
      >
        {label}
        {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? (required ? `${label}, required` : label)}
        accessibilityHint={error ?? accessibilityHint ?? hint}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderRadius: radius.md,
          borderColor: error ? colors.destructive : colors.input,
          color: colors.foreground,
          fontSize: fontSize.md,
        }}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ color: colors.destructive, fontSize: fontSize.xs }}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{hint}</Text>
      ) : null}
    </View>
  );
}

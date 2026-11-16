import { Text, TextInput, View } from "react-native";
import CharacterCounter from "./CharacterCounter";
import { useFieldErrorAnnouncement } from "../hooks/useFieldErrorAnnouncement";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { FormFieldProps } from "../types/FormFieldProps";

export default function FormField({
  label,
  error,
  hint,
  counter,
  required = false,
  trailing,
  style,
  inputStyle,
  accessibilityLabel,
  accessibilityHint,
  ...inputProps
}: FormFieldProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  useFieldErrorAnnouncement(accessibilityLabel ?? label, error);

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "500" }}
      >
        {label}
        {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
      </Text>
      <View style={{ justifyContent: "center" }}>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          {...inputProps}
          accessibilityLabel={accessibilityLabel ?? (required ? `${label}, required` : label)}
          accessibilityHint={error ?? accessibilityHint ?? hint}
          style={[
            {
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing.md,
              paddingRight: trailing ? MIN_TOUCH_TARGET + spacing.md : spacing.md,
              borderWidth: 1,
              borderRadius: radius.md,
              borderColor: error ? colors.destructiveText : colors.inputBorder,
              color: colors.foreground,
              fontSize: fontSize.md,
            },
            inputStyle,
          ]}
        />
        {trailing ? <View style={{ position: "absolute", right: 0 }}>{trailing}</View> : null}
      </View>
      {error ? (
        // Plain text, not an alert: the error is announced once by useFieldErrorAnnouncement, and is in the
        // input's hint. This copy stays reachable by swiping for anyone who has hints turned off.
        <Text
          style={{ color: colors.destructiveText, fontSize: fontSize.xs }}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{hint}</Text>
      ) : null}
      {counter ? <CharacterCounter counter={counter} isOver={error !== undefined} /> : null}
    </View>
  );
}

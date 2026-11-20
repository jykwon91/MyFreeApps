import { Text, TextInput, View } from "react-native";
import CharacterCounter from "./CharacterCounter";
import FieldError from "./FieldError";
import FieldLabel from "./FieldLabel";
import { MULTILINE_FIELD_MIN_HEIGHT } from "../constants/multilineField";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import { requiredFieldLabel } from "../utils/requiredFieldLabel";
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
  multiline = false,
  ...inputProps
}: FormFieldProps) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <FieldLabel label={label} required={required} />
      <View style={{ justifyContent: "center" }}>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          {...inputProps}
          multiline={multiline}
          accessibilityLabel={accessibilityLabel ?? requiredFieldLabel(label, required)}
          accessibilityHint={error ?? accessibilityHint ?? hint}
          style={[
            {
              minHeight: multiline ? MULTILINE_FIELD_MIN_HEIGHT : MIN_TOUCH_TARGET,
              ...(multiline ? { paddingTop: spacing.md, textAlignVertical: "top" as const } : null),
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
        <FieldError message={error} name={accessibilityLabel ?? label} size="xs" />
      ) : hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{hint}</Text>
      ) : null}
      {counter ? <CharacterCounter counter={counter} isOver={error !== undefined} /> : null}
    </View>
  );
}

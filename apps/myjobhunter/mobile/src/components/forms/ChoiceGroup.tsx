import { FieldError, FieldLabel, OptionRow, requiredFieldLabel, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { ChoiceGroupProps } from "../../types/ChoiceGroupProps";

/** One choice from a short list, every option on screen: the phone's form of a select. */
export default function ChoiceGroup<Value extends string>({ label, options, value, onChange, required = false, error, disabled = false }: ChoiceGroupProps<Value>) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <FieldLabel label={label} required={required} />
      <View
        accessibilityHint={error}
        accessibilityLabel={requiredFieldLabel(label, required)}
        accessibilityRole="radiogroup"
        style={{ borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}
      >
        {options.map((option) => (
          <OptionRow
            disabled={disabled}
            isSelected={option.value === value}
            key={option.value}
            label={option.label}
            onPress={() => {
              if (!disabled) onChange(option.value);
            }}
          />
        ))}
      </View>
      <FieldError message={error} name={label} />
    </View>
  );
}

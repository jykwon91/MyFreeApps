import { OptionRow, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ChoiceGroupProps } from "../../types/ChoiceGroupProps";
import FieldError from "./FieldError";

/** One choice from a short list, every option on screen: the phone's form of a select. */
export default function ChoiceGroup<Value extends string>({ label, options, value, onChange, required = false, error, disabled = false }: ChoiceGroupProps<Value>) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>
        {label}
        {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
      </Text>
      <View
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}
      >
        {options.map((option) => (
          <OptionRow
            isSelected={option.value === value}
            key={option.value}
            label={option.label}
            onPress={() => {
              if (!disabled) onChange(option.value);
            }}
          />
        ))}
      </View>
      <FieldError message={error} />
    </View>
  );
}

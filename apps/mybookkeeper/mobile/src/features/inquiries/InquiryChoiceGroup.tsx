import { OptionRow, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { InquiryChoiceGroupProps } from "../../types/InquiryChoiceGroupProps";

/** Pick one, in place: a sheet over the form would stack one modal on another. */
export default function InquiryChoiceGroup<Value extends string>({ label, choices, value, onSelect, disabled }: InquiryChoiceGroupProps<Value>) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      {choices.map((choice) => (
        <OptionRow
          isSelected={choice.value === value}
          key={choice.value}
          label={choice.label}
          onPress={() => {
            if (!disabled) onSelect(choice.value);
          }}
        />
      ))}
    </View>
  );
}

import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ToggleChipsFieldProps } from "../../types/ToggleChipsFieldProps";
import ChipButton from "./ChipButton";

/** Options to switch on and off, any number of them, as the website's toggle chips. */
export default function ToggleChipsField({ label, options, values, onChange, disabled = false }: ToggleChipsFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>{label}</Text>
      <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((option) => {
          const isOn = values.includes(option.value);
          return (
            <ChipButton
              disabled={disabled}
              isChecked={isOn}
              key={option.value}
              label={option.label}
              onPress={() => onChange(isOn ? values.filter((value) => value !== option.value) : [...values, option.value])}
            />
          );
        })}
      </View>
    </View>
  );
}

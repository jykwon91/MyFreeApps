import { Switch, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SwitchRowProps } from "../types/SwitchRowProps";

/** A label with an on/off switch. The whole row is at least a touch target tall. */
export default function SwitchRow({ label, note, value, onValueChange, disabled = false }: SwitchRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, minHeight: MIN_TOUCH_TARGET }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{label}</Text>
        {note ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{note}</Text> : null}
      </View>
      <Switch accessibilityHint={note} accessibilityLabel={label} disabled={disabled} onValueChange={onValueChange} value={value} />
    </View>
  );
}

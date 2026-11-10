import { Text, View } from "react-native";
import { CHIP_LINE_HEIGHT, CHIP_PADDING_VERTICAL } from "../constants/chip";
import { useTheme } from "../theme/useTheme";
import type { ChipProps } from "../types/ChipProps";

/** A short label set apart from the text around it, such as a status. Not pressable. */
export default function Chip({ label }: ChipProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: spacing.sm,
        paddingVertical: CHIP_PADDING_VERTICAL,
        borderRadius: radius.md,
        backgroundColor: colors.muted,
      }}
      testID="chip"
    >
      <Text style={{ fontSize: fontSize.xs, lineHeight: CHIP_LINE_HEIGHT, color: colors.foreground }}>{label}</Text>
    </View>
  );
}

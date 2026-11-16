import { Text, useWindowDimensions, View } from "react-native";
import { LABEL_VALUE_STACK_FONT_SCALE } from "../constants/labelValueRow";
import { useTheme } from "../theme/useTheme";
import type { LabelValueRowProps } from "../types/LabelValueRowProps";

/**
 * A label with its value. They share a line, the label shrinking and wrapping before the value is pushed
 * off screen. At large text sizes the label stacks above the value so neither is squeezed. A screen reader
 * reads the label, then the value.
 */
export default function LabelValueRow({
  label,
  value,
  labelSize = "md",
  valueSize = "md",
  labelTone = "muted",
  valueTone = "foreground",
  valueWeight = "400",
  tabularNums = false,
  valueAlign = "end",
  labelMinWidth,
  valueWraps = false,
  trailing,
  accessibilityLabel,
  accessibilityHint,
  accessible = true,
}: LabelValueRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= LABEL_VALUE_STACK_FONT_SCALE;
  const tone = { foreground: colors.foreground, muted: colors.mutedForeground };
  const labelText = (
    <Text
      style={{
        flexShrink: 1,
        minWidth: stacked ? undefined : labelMinWidth,
        fontSize: fontSize[labelSize],
        color: tone[labelTone],
      }}
    >
      {label}
    </Text>
  );
  const valueText = (
    <Text
      style={{
        flexShrink: valueWraps || stacked ? 1 : 0,
        fontSize: fontSize[valueSize],
        fontWeight: valueWeight,
        fontVariant: tabularNums ? ["tabular-nums"] : undefined,
        textAlign: !stacked && valueAlign === "end" ? "right" : "left",
        color: tone[valueTone],
      }}
    >
      {value}
    </Text>
  );
  return (
    <View
      accessible={accessible}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessible ? (accessibilityLabel ?? `${label}, ${value}`) : undefined}
      style={
        stacked
          ? { gap: spacing.xs }
          : { flexDirection: "row", alignItems: "baseline", justifyContent: valueAlign === "end" ? "space-between" : "flex-start", gap: spacing.md }
      }
    >
      {labelText}
      {stacked ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: spacing.sm }}>
          {valueText}
          {trailing}
        </View>
      ) : (
        <>
          {valueText}
          {trailing}
        </>
      )}
    </View>
  );
}

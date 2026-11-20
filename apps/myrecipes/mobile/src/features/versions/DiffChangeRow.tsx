import { DIFF_CHANGE_DISPLAY } from "@myrecipes/api-client/constants/versions";
import { useTheme, useToneColor } from "@platform/mobile";
import { Text, View } from "react-native";
import { DIFF_CHANGE_TONES } from "../../constants/versions";
import type { DiffChangeRowProps } from "../../types/DiffChangeRowProps";
import DiffChangeText from "./DiffChangeText";
import { diffLineLabel } from "../../utils/diffLineLabel";

/**
 * One change: its symbol and word (never colour alone), then the new text for an addition, the old
 * text struck through for a removal, or old → new for a change ("Cook time: 30 min → 45 min").
 */
export default function DiffChangeRow({ line }: DiffChangeRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const tone = useToneColor(DIFF_CHANGE_TONES[line.change]);
  const display = DIFF_CHANGE_DISPLAY[line.change];
  const text = { color: colors.foreground, fontSize: fontSize.md };
  const struck = { ...text, textDecorationLine: "line-through" as const };

  return (
    <View
      accessibilityLabel={diffLineLabel(line)}
      accessible
      style={{
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: tone?.background ?? colors.muted,
      }}
      testID={`diff-${line.change}`}
    >
      <Text style={{ color: tone?.foreground ?? colors.foreground, fontSize: fontSize.xs, fontWeight: "700" }}>
        {display.symbol} {display.label}
      </Text>
      <DiffChangeText line={line} struck={struck} text={text} />
    </View>
  );
}

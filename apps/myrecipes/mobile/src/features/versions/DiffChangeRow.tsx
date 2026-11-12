import { DIFF_CHANGE_DISPLAY } from "@myrecipes/api-client/constants/versions";
import { useTheme, useToneColor } from "@platform/mobile";
import { Text, View } from "react-native";
import { DIFF_CHANGE_TONES } from "../../constants/versions";
import type { DiffChangeRowProps } from "../../types/DiffChangeRowProps";
import { diffLineLabel } from "../../utils/diffLineLabel";

/**
 * One change: its symbol and word (never colour alone), then the new text for an addition, the old
 * text struck through for a removal, or old → new for a change.
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
      {line.change === "changed" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.sm }}>
          <Text style={struck}>{line.before}</Text>
          <Text style={text}>→</Text>
          <Text style={{ ...text, fontWeight: "600" }}>{line.after}</Text>
        </View>
      ) : line.change === "removed" ? (
        <Text style={struck}>{line.before}</Text>
      ) : (
        <Text style={{ ...text, fontWeight: "600" }}>{line.after}</Text>
      )}
    </View>
  );
}

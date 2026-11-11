import { plainDraftText } from "@myjobhunter/api-client/utils/plainDraftText";
import { MIN_TOUCH_TARGET, useTheme, useToneColor } from "@platform/mobile";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { RESUME_DRAFT_ROW_STYLES } from "../../constants/resumeDraftRowStyles";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeDraftRowProps } from "../../types/ResumeDraftRowProps";
import InlineMarkdownText from "./InlineMarkdownText";

/** One row of the draft. The row being refined has a band, said in words too; a pickable row is a button. */
export default function ResumeDraftRow({ row, canPick, isPickDisabled, onPick, onHighlightLayout }: ResumeDraftRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const band = useToneColor("warning");
  const { line, kind } = row;
  const style = RESUME_DRAFT_ROW_STYLES[kind];
  const isBullet = kind === "bullet";
  const text = (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {isBullet ? <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>•</Text> : null}
      <InlineMarkdownText source={line.text} style={{ flex: 1, color: colors.foreground, fontSize: fontSize[style.size], fontWeight: style.weight, textTransform: style.uppercase ? "uppercase" : "none" }} />
    </View>
  );
  const highlightStyle = line.highlight
    ? { borderLeftWidth: 4, borderLeftColor: band?.foreground, backgroundColor: band?.background, borderRadius: radius.sm, paddingLeft: spacing.sm }
    : null;
  const onLayout = line.highlight ? (event: LayoutChangeEvent) => onHighlightLayout(event.nativeEvent.layout.y) : undefined;

  if (line.pickable && canPick) {
    return (
      <Pressable
        accessibilityHint={MESSAGES.pickLineHint}
        accessibilityLabel={plainDraftText(line.text)}
        accessibilityRole="button"
        accessibilityState={{ disabled: isPickDisabled }}
        disabled={isPickDisabled}
        onPress={() => onPick(row)}
        style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: pressed ? colors.muted : undefined, opacity: isPickDisabled ? 0.6 : 1 })}
      >
        {text}
      </Pressable>
    );
  }
  return (
    <View
      accessibilityLabel={line.highlight ? `${plainDraftText(line.text)}, ${MESSAGES.refiningNow}` : undefined}
      accessible={line.highlight || undefined}
      accessibilityRole={kind.startsWith("heading") ? "header" : undefined}
      onLayout={onLayout}
      style={[{ paddingVertical: spacing.xs, marginTop: style.gapAbove ? spacing.md : 0 }, highlightStyle]}
      testID={line.highlight ? "resume-draft-highlight" : undefined}
    >
      {text}
    </View>
  );
}

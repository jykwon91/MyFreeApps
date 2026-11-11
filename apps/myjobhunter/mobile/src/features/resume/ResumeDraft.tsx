import { draftBlocks } from "@myjobhunter/api-client/utils/draftBlocks";
import { useTheme } from "@platform/mobile";
import { useRef } from "react";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { draftRows } from "../../lib/draftRows";
import type { ResumeDraftProps } from "../../types/ResumeDraftProps";
import ResumeDraftRow from "./ResumeDraftRow";

/**
 * The working copy, drawn from the same markdown subset the website's preview handles. The line
 * being refined is marked; while the session is active, any line after the contact details can be
 * tapped for a fresh suggestion.
 */
export default function ResumeDraft({ source, highlightText, canPick, isPickDisabled, onPick, onLayout, onHighlightLayout }: ResumeDraftProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const rows = draftRows(draftBlocks(source, highlightText, canPick));
  const rowsTop = useRef(0);
  return (
    <View onLayout={(event) => onLayout(event.nativeEvent.layout.y)} style={{ gap: spacing.sm }} testID="resume-draft">
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {MESSAGES.draftHeading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{highlightText ? MESSAGES.draftHighlighted : MESSAGES.draftPlain}</Text>
      {canPick ? (
        <View style={{ padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.muted }}>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{MESSAGES.draftTip}</Text>
        </View>
      ) : null}
      <View
        onLayout={(event) => (rowsTop.current = event.nativeEvent.layout.y)}
        style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
      >
        {rows.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.draftEmpty}</Text> : null}
        {rows.map((row) => (
          <ResumeDraftRow
            canPick={canPick}
            isPickDisabled={isPickDisabled}
            key={row.key}
            onHighlightLayout={(y) => onHighlightLayout(rowsTop.current + y)}
            onPick={(picked) => onPick({ text: picked.line.text, section: picked.line.section })}
            row={row}
          />
        ))}
      </View>
    </View>
  );
}

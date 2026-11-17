import { parseProvenanceFlags } from "@myjobhunter/api-client/utils/parseProvenanceFlags";
import { resumeParsedCounts } from "@myjobhunter/api-client/utils/resumeParsedCounts";
import { ClampedText, LARGE_TEXT_PREVIEW_LINES, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeParsedPanelProps } from "../../types/ResumeParsedPanelProps";
import ResumeProvenanceWarning from "./ResumeProvenanceWarning";

/** What was read from an upload: any unsourced-figures warning, the headline, summary and counts. */
export default function ResumeParsedPanel({ parsed }: ResumeParsedPanelProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const flagged = parseProvenanceFlags(parsed);
  return (
    <View
      accessibilityLabel={MESSAGES.parsedLabel}
      style={{ gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}
      testID="resume-parsed-panel"
    >
      {flagged.length > 0 ? <ResumeProvenanceWarning flagged={flagged} /> : null}
      {parsed.headline ? <Text style={{ color: colors.foreground, fontSize: fontSize.sm, fontWeight: "600" }}>{parsed.headline}</Text> : null}
      {parsed.summary ? (
        <ClampedText largeTextNumberOfLines={LARGE_TEXT_PREVIEW_LINES} numberOfLines={3} style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
          {parsed.summary}
        </ClampedText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        {resumeParsedCounts(parsed).map(({ count, label }) => (
          <Text key={label} style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{count}</Text> {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

import { parseProvenanceHeadline } from "@myjobhunter/api-client/utils/parseProvenanceHeadline";
import { parseProvenancePlace } from "@myjobhunter/api-client/utils/parseProvenancePlace";
import { useTheme, useToneColor } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ResumeProvenanceWarningProps } from "../../types/ResumeProvenanceWarningProps";

/**
 * Lines the parse wrote that weren't in the uploaded file: figures, dates or names. Advisory only,
 * the parsed data is kept as it is for the person to check on their Profile.
 */
export default function ResumeProvenanceWarning({ flagged }: ResumeProvenanceWarningProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const tone = useToneColor("warning");
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: tone?.foreground ?? colors.border, backgroundColor: tone?.background ?? colors.muted }}
      testID="resume-provenance-warning"
    >
      <Text style={{ color: tone?.foreground ?? colors.foreground, fontSize: fontSize.xs, fontWeight: "600" }}>{parseProvenanceHeadline(flagged.length)}</Text>
      {flagged.map((entry, index) => (
        <Text key={index} style={{ color: tone?.foreground ?? colors.foreground, fontSize: fontSize.xs }}>
          {`• ${entry.unsourced_terms.join(", ")} in ${parseProvenancePlace(entry)}: “${entry.text}”`}
        </Text>
      ))}
    </View>
  );
}

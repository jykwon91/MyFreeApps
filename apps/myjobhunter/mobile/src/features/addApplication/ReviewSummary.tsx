import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { ReviewSummaryProps } from "../../types/ReviewSummaryProps";

/** The website's green "review and adjust" box: what was read, and where from. */
export default function ReviewSummary({ summary, sourceUrl }: ReviewSummaryProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.card }}
      testID="add-application-review-summary"
    >
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.positiveText }}>
        {MESSAGES.reviewHeading}
      </Text>
      {summary ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{summary}</Text> : null}
      {sourceUrl ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
          {`${MESSAGES.fromLink} ${sourceUrl}`}
        </Text>
      ) : null}
    </View>
  );
}

import { toneForVerdict } from "@myjobhunter/api-client/utils/toneForVerdict";
import { verdictBannerLabel } from "@myjobhunter/api-client/utils/verdictBannerLabel";
import { useTheme, useToneColor } from "@platform/mobile";
import { Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { VerdictCardProps } from "../../types/VerdictCardProps";

/**
 * The overall fit and why, in the verdict's tone as the website's banner is: the first thing read
 * after the role. A verdict this build doesn't know says only "Analyzed", as there.
 */
export default function VerdictCard({ verdict, summary }: VerdictCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const toned = useToneColor(toneForVerdict(verdict));
  const foreground = toned?.foreground ?? colors.foreground;
  const label = verdictBannerLabel(verdict);
  return (
    <View
      accessibilityLabel={`${MESSAGES.verdictHeading}: ${label}. ${summary}`}
      accessible
      style={{
        gap: spacing.xs,
        padding: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: toned?.foreground ?? colors.border,
        backgroundColor: toned?.background ?? colors.card,
      }}
      testID="verdict-card"
    >
      <Text style={{ color: foreground, fontSize: fontSize.xs, fontWeight: "600" }}>{MESSAGES.verdictHeading.toUpperCase()}</Text>
      <Text style={{ color: foreground, fontSize: fontSize.xl, fontWeight: "600" }}>{label}</Text>
      {summary ? <Text style={{ color: foreground, fontSize: fontSize.md }}>{summary}</Text> : null}
    </View>
  );
}

import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import { overviewFacts } from "../../lib/overviewFacts";
import type { OverviewSectionProps } from "../../types/OverviewSectionProps";
import OverviewFact from "./OverviewFact";
import SectionHeading from "./SectionHeading";

/** The posting link, the facts the website's overview shows, and the job description. */
export default function OverviewSection({ application }: OverviewSectionProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const openLink = useOpenLink();
  const url = application.url;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={MESSAGES.overview} />
      {url ? (
        <Pressable accessibilityHint={MESSAGES.openPosting} accessibilityRole="link" onPress={() => void openLink(url)} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
          <Text style={{ fontSize: fontSize.md, color: colors.primary, textDecorationLine: "underline" }}>{url}</Text>
        </Pressable>
      ) : null}
      {overviewFacts(application).map((fact) => (
        <OverviewFact key={fact.label} label={fact.label} value={fact.value} />
      ))}
      {application.jd_text ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}>
          <Text
            accessibilityRole="header"
            style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, fontSize: fontSize.xs, color: colors.mutedForeground }}
          >
            {MESSAGES.jobDescription.toUpperCase()}
          </Text>
          <Text selectable style={{ padding: spacing.md, fontSize: fontSize.sm, color: colors.foreground }}>
            {application.jd_text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

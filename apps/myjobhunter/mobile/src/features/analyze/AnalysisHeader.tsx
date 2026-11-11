import { jobAnalysisHeadline } from "@myjobhunter/api-client/utils/jobAnalysisHeadline";
import { jobAnalysisSourceUrl } from "@myjobhunter/api-client/utils/jobAnalysisSourceUrl";
import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalysisHeaderProps } from "../../types/AnalysisHeaderProps";

/** The role, its company and location, and the posting it came from. Only an http or https posting opens. */
export default function AnalysisHeader({ extracted, sourceUrl }: AnalysisHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { title, company, location } = jobAnalysisHeadline(extracted);
  const link = jobAnalysisSourceUrl(sourceUrl);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
        {title}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        <Text style={{ color: colors.foreground, fontWeight: "500" }}>{company}</Text>
        {location ? ` — ${location}` : null}
      </Text>
      {link ? (
        <Pressable
          accessibilityHint={MESSAGES.opensPosting}
          accessibilityLabel={link}
          accessibilityRole="link"
          onPress={() => void openLink(link)}
          style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text ellipsizeMode="middle" numberOfLines={1} style={{ color: colors.primary, fontSize: fontSize.xs, textDecorationLine: "underline" }}>
            {link}
          </Text>
        </Pressable>
      ) : sourceUrl ? (
        <Text ellipsizeMode="middle" numberOfLines={1} selectable style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
          {sourceUrl}
        </Text>
      ) : null}
    </View>
  );
}

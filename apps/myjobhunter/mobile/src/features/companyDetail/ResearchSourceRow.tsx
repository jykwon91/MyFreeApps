import { researchSourceUrl } from "@myjobhunter/api-client/utils/researchSourceUrl";
import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import type { ResearchSourceRowProps } from "../../types/ResearchSourceRowProps";

/**
 * A page the research came from: its title (or address) and a snippet. Only an http or https
 * address is a link; anything else the search returned shows as plain text that can't be opened.
 */
export default function ResearchSourceRow({ source }: ResearchSourceRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const url = researchSourceUrl(source);
  const name = source.title ?? source.url;
  const snippet = source.snippet ? (
    <Text numberOfLines={2} style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
      {source.snippet}
    </Text>
  ) : null;

  if (url === null) {
    return (
      <View style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.xs }} testID="research-source-text">
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {name}
        </Text>
        {snippet}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={MESSAGES.opensSource}
      accessibilityLabel={name}
      accessibilityRole="link"
      onPress={() => void openLink(url)}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.xs, opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.primary, textDecorationLine: "underline" }}>{name}</Text>
      {snippet}
    </Pressable>
  );
}

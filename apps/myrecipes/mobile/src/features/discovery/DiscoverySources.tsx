import { hostLabel } from "@myrecipes/api-client/utils/hostLabel";
import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DISCOVERY_DETAIL_COPY } from "../../constants/discovery";

/** Every page the read drew on, so the reader can go to the original. */
export default function DiscoverySources({ sources }: { sources: string[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  if (sources.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.sm, fontWeight: "600" }}>
        {DISCOVERY_DETAIL_COPY.sourcesHeading}
      </Text>
      {sources.map((source) => (
        <Pressable
          accessibilityHint="Opens in your browser"
          accessibilityRole="link"
          key={source}
          onPress={() => void openLink(source)}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text numberOfLines={1} style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>
            {hostLabel(source) || source}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

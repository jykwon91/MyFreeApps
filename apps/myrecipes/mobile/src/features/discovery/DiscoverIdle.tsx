import { DISCOVERY_EMPTY_COPY, DISCOVERY_INTRO, DISCOVERY_SUGGESTIONS } from "@myrecipes/api-client/constants/discovery";
import { EmptyState, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";

/** Before the first search: what Discover does, and dishes to try so it's never a dead end. */
export default function DiscoverIdle({ onSuggestion }: { onSuggestion: (query: string) => void }) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{DISCOVERY_INTRO}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>Try:</Text>
        {DISCOVERY_SUGGESTIONS.map((suggestion) => (
          <Pressable
            accessibilityHint="Searches the web for this dish"
            accessibilityRole="button"
            key={suggestion}
            onPress={() => onSuggestion(suggestion)}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: "center",
              paddingHorizontal: spacing.md,
              borderWidth: 1,
              borderRadius: radius.full,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.muted : colors.card,
            })}
          >
            <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
      <EmptyState body={DISCOVERY_EMPTY_COPY.body} heading={DISCOVERY_EMPTY_COPY.heading} />
    </View>
  );
}

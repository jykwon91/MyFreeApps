import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { AI_SUGGESTION_MESSAGES as MESSAGES } from "../../constants/aiSuggestions";
import type { AiSuggestionRowProps } from "../../types/AiSuggestionRowProps";

export default function AiSuggestionRow({ item, typeLabel, isNew }: AiSuggestionRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = [`[${item.key}]`, typeLabel, isNew ? MESSAGES.notInSpec : null, item.description || null].filter(Boolean).join(". ");
  return (
    <View accessible accessibilityLabel={label} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{`[${item.key}]`}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{isNew ? `${typeLabel}. ${MESSAGES.notInSpec}` : typeLabel}</Text>
      {item.description ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{item.description}</Text> : null}
    </View>
  );
}

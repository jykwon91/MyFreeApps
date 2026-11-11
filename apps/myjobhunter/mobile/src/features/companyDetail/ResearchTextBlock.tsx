import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ResearchTextBlockProps } from "../../types/ResearchTextBlockProps";

/** One labelled paragraph of the research. */
export default function ResearchTextBlock({ label, text, isHighlighted = false, isMuted = false }: ResearchTextBlockProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View
      style={[{ gap: spacing.xs }, isHighlighted ? { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md } : null]}
    >
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xs, fontWeight: "500", color: isHighlighted ? colors.primary : colors.mutedForeground }}>
        {label.toUpperCase()}
      </Text>
      <Text selectable style={{ fontSize: fontSize.sm, color: isMuted ? colors.mutedForeground : colors.foreground }}>
        {text}
      </Text>
    </View>
  );
}

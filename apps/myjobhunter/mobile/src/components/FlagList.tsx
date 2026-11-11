import { Chip, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { FlagListProps } from "../types/FlagListProps";

/** Green or red flags under a chip in their tone, one per line. Nothing when there are none. */
export default function FlagList({ title, tone, flags }: FlagListProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (flags.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Chip label={title} tone={tone} />
      {flags.map((flag, index) => (
        <View key={`${index}-${flag}`} style={{ flexDirection: "row", gap: spacing.sm }}>
          <Text importantForAccessibility="no" style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            •
          </Text>
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.foreground }}>{flag}</Text>
        </View>
      ))}
    </View>
  );
}

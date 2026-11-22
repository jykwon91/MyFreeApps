import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function ApplicantHistoryItem({ title, right, lines }: { title: string; right?: string; lines: string[] }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{title}</Text>
        {right ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{right}</Text> : null}
      </View>
      {lines.map((line, index) => (
        <Text key={index} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{line}</Text>
      ))}
    </View>
  );
}

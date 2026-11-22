import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function InquiryLine({ left, right, muted, note }: { left: string; right?: string; muted?: boolean; note?: string | null }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, color: muted ? colors.mutedForeground : colors.foreground }}>{left}</Text>
        {note ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{note}</Text> : null}
      </View>
      {right ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{right}</Text> : null}
    </View>
  );
}

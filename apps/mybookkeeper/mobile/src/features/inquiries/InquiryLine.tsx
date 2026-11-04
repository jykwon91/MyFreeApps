import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function InquiryLine({ left, right, muted }: { left: string; right?: string; muted?: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ flexDirection: "row", gap: spacing.sm }}>
      <Text style={{ flex: 1, fontSize: fontSize.sm, color: muted ? colors.mutedForeground : colors.foreground }}>{left}</Text>
      {right ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{right}</Text> : null}
    </View>
  );
}

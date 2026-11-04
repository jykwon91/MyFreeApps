import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function InquiryChip({ label }: { label: string }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.muted }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.foreground }}>{label}</Text>
    </View>
  );
}

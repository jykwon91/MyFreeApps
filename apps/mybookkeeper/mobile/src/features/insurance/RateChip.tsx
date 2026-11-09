import type { RateFilingTone } from "@mybookkeeper/api-client/types/insurance/rate-filing-tone";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

/** The label always spells the meaning out, so the tint only reinforces it. */
export default function RateChip({ label, tone }: { label: string; tone: RateFilingTone }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const background = tone === "orange" ? colors.toastErrorBackground : tone === "green" ? colors.toastSuccessBackground : colors.muted;
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: background }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.foreground }}>{label}</Text>
    </View>
  );
}

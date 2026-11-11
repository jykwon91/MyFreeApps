import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";

/** The website's page heading and what refinement does. */
export default function ResumeIntro() {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
        {MESSAGES.heading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.intro}</Text>
    </View>
  );
}

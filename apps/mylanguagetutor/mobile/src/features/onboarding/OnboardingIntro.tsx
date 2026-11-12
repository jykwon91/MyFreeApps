import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { OnboardingIntroProps } from "../../types/OnboardingIntroProps";

/** The step, heading and line of explanation above an onboarding step's choices. */
export default function OnboardingIntro({ step, heading, intro }: OnboardingIntroProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
      {step ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, fontWeight: "500", textTransform: "uppercase" }}>
          {step}
        </Text>
      ) : null}
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
        {heading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{intro}</Text>
    </View>
  );
}

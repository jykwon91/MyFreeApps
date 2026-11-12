import { useTheme, useToneColor } from "@platform/mobile";
import { View } from "react-native";
import type { ResumeCardProps } from "../../types/ResumeCardProps";

/** The bordered card each part of a session sits in. */
export default function ResumeCard({ children, tone = "neutral", testID }: ResumeCardProps) {
  const { colors, spacing, radius } = useTheme();
  const toneColor = useToneColor(tone);
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: toneColor?.foreground ?? colors.border,
        backgroundColor: colors.card,
      }}
      testID={testID}
    >
      {children}
    </View>
  );
}

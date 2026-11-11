import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { SettingsCardProps } from "../../types/SettingsCardProps";

/** One of the Security screen's sections, boxed as the website boxes them. */
export default function SettingsCard({ children, testID }: SettingsCardProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={testID}
    >
      {children}
    </View>
  );
}

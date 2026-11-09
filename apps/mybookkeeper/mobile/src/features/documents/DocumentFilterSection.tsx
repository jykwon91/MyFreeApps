import { useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

export default function DocumentFilterSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs, fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

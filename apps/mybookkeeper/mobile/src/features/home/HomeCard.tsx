import { useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

export default function HomeCard({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }} testID={testID}>
      {title ? (
        <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

import { useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

export default function InquirySection({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

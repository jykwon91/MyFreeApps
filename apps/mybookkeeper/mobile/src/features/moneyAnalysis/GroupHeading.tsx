import { useTheme } from "@platform/mobile";
import { Text } from "react-native";

export default function GroupHeading({ children }: { children: string }) {
  const { colors, fontSize } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
      {children}
    </Text>
  );
}

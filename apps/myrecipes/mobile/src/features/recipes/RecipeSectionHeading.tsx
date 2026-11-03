import { useTheme } from "@platform/mobile";
import { Text } from "react-native";

export default function RecipeSectionHeading({ children }: { children: string }) {
  const { colors, fontSize } = useTheme();

  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}
    >
      {children}
    </Text>
  );
}

import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import type { SectionHeadingProps } from "../../types/SectionHeadingProps";

export default function SectionHeading({ title, count }: SectionHeadingProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
      {title}
      {count === undefined ? null : <Text style={{ fontWeight: "400", color: colors.mutedForeground }}>{` (${count})`}</Text>}
    </Text>
  );
}

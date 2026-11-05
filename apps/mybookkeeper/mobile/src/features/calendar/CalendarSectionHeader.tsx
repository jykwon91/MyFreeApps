import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import type { CalendarSection } from "../../types/CalendarSection";

interface CalendarSectionHeaderProps {
  section: CalendarSection;
}

export default function CalendarSectionHeader({ section }: CalendarSectionHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Text
      accessibilityLabel={section.spokenTitle}
      accessibilityRole="header"
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        fontSize: fontSize.sm,
        fontWeight: "600",
        color: colors.mutedForeground,
        backgroundColor: colors.background,
      }}
    >
      {section.title}
    </Text>
  );
}

import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { sectionSummaryLine } from "./welcomeManualDisplay";

interface WelcomeManualSectionRowProps {
  section: WelcomeManualSectionResponse;
  roomName: string | null;
  onPress: () => void;
}

export default function WelcomeManualSectionRow({ section, roomName, onPress }: WelcomeManualSectionRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const summary = sectionSummaryLine(section);
  return (
    <Pressable
      accessibilityLabel={[section.title, roomName, summary].filter(Boolean).join(", ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {section.title}
      </Text>
      {roomName ? <Chip label={roomName} /> : null}
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {summary}
      </Text>
    </Pressable>
  );
}

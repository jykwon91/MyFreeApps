import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";
import { Chip, ClampedText, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { manualRowLabel, manualSummaryLine } from "./welcomeManualDisplay";

interface WelcomeManualRowProps {
  manual: WelcomeManualSummary;
  propertyName: string | null;
  onPress: () => void;
}

export default function WelcomeManualRow({ manual, propertyName, onPress }: WelcomeManualRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={manualRowLabel(manual, propertyName)}
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
      <ClampedText numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {manual.title}
      </ClampedText>
      {propertyName ? (
        <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {propertyName}
        </ClampedText>
      ) : null}
      <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {manualSummaryLine(manual)}
      </ClampedText>
      {manual.section_count === 0 ? <Chip label={WELCOME_MANUAL_MESSAGES.noSectionsChip} /> : null}
    </Pressable>
  );
}

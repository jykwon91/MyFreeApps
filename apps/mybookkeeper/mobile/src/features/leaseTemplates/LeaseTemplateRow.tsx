import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { templateCountsLine, templateRowLabel } from "./leaseTemplateDisplay";

interface LeaseTemplateRowProps {
  template: LeaseTemplateSummary;
  onPress: () => void;
}

export default function LeaseTemplateRow({ template, onPress }: LeaseTemplateRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={templateRowLabel(template)}
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
        {template.name}
      </Text>
      {template.description ? (
        <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {template.description}
        </Text>
      ) : null}
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {templateCountsLine(template)}
      </Text>
    </Pressable>
  );
}

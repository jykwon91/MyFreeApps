import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { selectedLabel } from "../../constants/newLease";
import { templateCountsLine } from "../leaseTemplates/leaseTemplateDisplay";

interface TemplatePickerRowProps {
  template: LeaseTemplateSummary;
  /** Where it falls in the pick order, from 1. Null when it isn't picked. */
  position: number | null;
  onPress: () => void;
}

export default function TemplatePickerRow({ template, position, onPress }: TemplatePickerRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const isSelected = position !== null;
  return (
    <Pressable
      accessibilityLabel={isSelected ? `${template.name}, ${selectedLabel(position)}` : template.name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed || isSelected ? colors.muted : colors.background,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {template.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {templateCountsLine(template)}
        </Text>
      </View>
      {isSelected ? <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.primary }}>{selectedLabel(position)}</Text> : null}
    </Pressable>
  );
}

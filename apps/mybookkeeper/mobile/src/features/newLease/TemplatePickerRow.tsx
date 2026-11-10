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
  /** A line under the counts, such as a warning that picking it makes it again. */
  note?: string;
  /** Can't be picked, so it is dimmed and a tap does nothing. */
  isDisabled?: boolean;
}

export default function TemplatePickerRow({ template, position, onPress, note, isDisabled = false }: TemplatePickerRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const isSelected = position !== null;
  return (
    <Pressable
      accessibilityHint={note}
      accessibilityLabel={isSelected ? `${template.name}, ${selectedLabel(position)}` : template.name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
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
        opacity: isDisabled ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {template.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {templateCountsLine(template)}
        </Text>
        {note ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{note}</Text> : null}
      </View>
      {isSelected ? <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.primary }}>{selectedLabel(position)}</Text> : null}
    </Pressable>
  );
}

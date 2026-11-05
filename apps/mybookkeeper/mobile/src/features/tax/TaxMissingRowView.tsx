import type { ChecklistItem } from "@mybookkeeper/api-client/types/tax/ChecklistItem";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { TAX_DOCUMENTS_MESSAGES as MESSAGES } from "../../constants/taxDocuments";
import { missingLabel } from "./taxDocumentsDisplay";

interface TaxMissingRowViewProps {
  item: ChecklistItem;
  /** Left out for someone who can only view. */
  onAdd: (() => void) | undefined;
}

export default function TaxMissingRowView({ item, onAdd }: TaxMissingRowViewProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = missingLabel(item);
  return (
    <View
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View accessible accessibilityLabel={`${label}. ${item.reason}`} style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{item.reason}</Text>
      </View>
      {onAdd ? (
        <Pressable
          accessibilityLabel={`${MESSAGES.addIt}: ${label}`}
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={onAdd}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.primary }}>{MESSAGES.addIt}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

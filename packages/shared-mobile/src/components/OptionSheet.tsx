import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { OptionSheetProps } from "../types/OptionSheetProps";
import OptionRow from "./OptionRow";

/** A list to pick one thing from, sliding up over the current screen. */
export default function OptionSheet<Value extends string>({
  isOpen,
  title,
  description,
  options,
  value,
  onSelect,
  onClose,
  emptyText,
}: OptionSheetProps<Value>) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>Close</Text>
          </Pressable>
        </View>
        {description ? (
          <Text style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {description}
          </Text>
        ) : null}
        <FlatList
          ListEmptyComponent={
            emptyText ? (
              <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>{emptyText}</Text>
            ) : undefined
          }
          accessibilityRole="radiogroup"
          data={options}
          keyExtractor={(option) => option.value}
          renderItem={({ item }) => (
            <OptionRow isSelected={item.value === value} label={item.label} onPress={() => onSelect(item.value)} />
          )}
        />
      </View>
    </Modal>
  );
}

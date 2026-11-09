import { useEffect, useRef } from "react";
import { FlatList, Modal, Platform, Pressable, Text, View } from "react-native";
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
  emptyContent,
  onClosed,
}: OptionSheetProps<Value>) {
  const { colors, spacing, fontSize } = useTheme();
  const wasOpen = useRef(isOpen);
  const list = useRef<FlatList<(typeof options)[number]>>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);

  // A long list opens on the current choice instead of making the person scroll to it.
  function showSelected(): void {
    if (selectedIndex > 0) list.current?.scrollToIndex({ index: selectedIndex, viewPosition: 0.5, animated: false });
  }

  // Only iOS tells a Modal it has finished closing. Android has nothing to wait for.
  useEffect(() => {
    if (Platform.OS !== "ios" && wasOpen.current && !isOpen) onClosed?.();
    wasOpen.current = isOpen;
  }, [isOpen, onClosed]);

  return (
    <Modal animationType="slide" onDismiss={Platform.OS === "ios" ? onClosed : undefined} onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
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
            emptyContent ? (
              <>{emptyContent}</>
            ) : emptyText ? (
              <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>{emptyText}</Text>
            ) : undefined
          }
          accessibilityRole="radiogroup"
          data={options}
          keyExtractor={(option) => option.value}
          onLayout={showSelected}
          onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
          ref={list}
          renderItem={({ item }) => (
            <OptionRow isSelected={item.value === value} label={item.label} onPress={() => onSelect(item.value)} />
          )}
        />
      </View>
    </Modal>
  );
}

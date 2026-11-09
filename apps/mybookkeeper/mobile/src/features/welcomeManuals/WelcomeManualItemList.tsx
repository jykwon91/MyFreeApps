import { EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { FlatList, Text, View, type RefreshControlProps } from "react-native";
import type { ReactElement } from "react";
import { useCanWrite } from "../workspace/useCanWrite";

interface WelcomeManualItemListProps<Item> {
  items: readonly Item[];
  keyOf: (item: Item) => string;
  renderItem: (item: Item) => ReactElement;
  refreshControl: ReactElement<RefreshControlProps>;
  testID: string;
  /** Shown above the list, like a line about what these are. */
  hint?: string;
  emptyHeading: string;
  emptyBody: string;
  addLabel: string;
  /** False once the manual's cap is reached: the button gives way to this line. */
  canAdd: boolean;
  atLimit: string;
  onAdd: () => void;
  reorderLabel?: string;
  onReorder?: () => void;
}

/** A manual's items on their own screen, with add and reorder for people who can change it. */
export default function WelcomeManualItemList<Item>({
  items, keyOf, renderItem, refreshControl, testID, hint, emptyHeading, emptyBody, addLabel, canAdd, atLimit, onAdd, reorderLabel, onReorder,
}: WelcomeManualItemListProps<Item>) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const add = canWrite && canAdd ? { label: addLabel, onPress: onAdd } : undefined;
  return (
    <FlatList
      ListEmptyComponent={<EmptyState action={add} body={emptyBody} heading={emptyHeading} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, padding: spacing.lg }}>
          {hint ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{hint}</Text> : null}
          {canWrite && items.length > 0 ? (
            <>
              {canAdd ? <LoadingButton onPress={onAdd}>{addLabel}</LoadingButton> : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{atLimit}</Text>}
              {items.length > 1 && onReorder && reorderLabel ? (
                <LoadingButton onPress={onReorder} variant="secondary">
                  {reorderLabel}
                </LoadingButton>
              ) : null}
            </>
          ) : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      keyExtractor={keyOf}
      refreshControl={refreshControl}
      renderItem={({ item }) => renderItem(item)}
      testID={testID}
    />
  );
}

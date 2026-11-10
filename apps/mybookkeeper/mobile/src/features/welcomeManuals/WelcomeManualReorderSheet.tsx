import type { WelcomeManualItemWords } from "../../types/WelcomeManualItemWords";
import type { WelcomeManualReorderItem } from "../../types/WelcomeManualReorderItem";
import { moveItem, sameOrder } from "@mybookkeeper/api-client/utils/welcomeManualReorder";
import { FormSheet, LoadingButton, MIN_TOUCH_TARGET, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { HELD_THUMBNAIL_SIZE } from "../../constants/uploads";
import { WELCOME_MANUAL_REORDER_MESSAGES as MESSAGES, moveDownLabel, moveUpLabel } from "../../constants/welcomeManualForms";
import { useWrite } from "../../lib/useWrite";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { reorderFailure } from "./welcomeManualFailure";

interface WelcomeManualReorderSheetProps {
  title: string;
  words: WelcomeManualItemWords;
  /** The order as it is now. Taken when the sheet opens, so a reload can't reshuffle what's being moved. */
  items: readonly WelcomeManualReorderItem[];
  /** Names a row that has no label of its own by where it is now, so the name follows the row as it moves. */
  unnamedLabel?: (position: number) => string;
  /** One request carrying the whole new order. */
  reorder: (ids: string[]) => Promise<unknown>;
  onClose: () => void;
}

/** Moves items with arrows and sends the new order once, when saved. There is no dragging on a phone worth relying on. */
export default function WelcomeManualReorderSheet({ title, words, items, reorder, unnamedLabel, onClose }: WelcomeManualReorderSheetProps) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const { showToast } = useToast();
  const write = useWrite();
  const [original] = useState(() => items.map((item) => item.id));
  const [rows] = useState(() => new Map(items.map((item) => [item.id, item])));
  const [order, setOrder] = useState(original);
  const isDirty = !sameOrder(order, original);
  const isStale = write.failure === "conflict";

  function close(): void {
    if (write.isBusy) return;
    if (isDirty && !isStale) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    const result = await write.run(() => reorder(order));
    if (result === "done") {
      onClose();
      showToast(MESSAGES.saved);
    } else if (result === "conflict") {
      // The failed write already made the manual reload, so the list is fresh when the sheet is gone.
      onClose();
      showToast(MESSAGES.stale, "error");
    }
  }

  return (
    <FormSheet failure={write.error && !isStale ? reorderFailure(write.error, words) : null} isOpen onRequestClose={close} title={title}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.hint}</Text>
      {order.map((id, index) => {
        const row = rows.get(id);
        const label = row?.label ?? unnamedLabel?.(index + 1) ?? "";
        return (
          <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}>
            {row && row.thumbnailUri !== undefined ? (
              <Image
                accessibilityIgnoresInvertColors
                source={row.thumbnailUri ? { uri: row.thumbnailUri } : undefined}
                testID="reorder-thumbnail"
                style={{ width: HELD_THUMBNAIL_SIZE, height: HELD_THUMBNAIL_SIZE, borderRadius: radius.md, backgroundColor: colors.muted }}
              />
            ) : null}
            <Text numberOfLines={2} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>
              {label}
            </Text>
            <LoadingButton accessibilityLabel={moveUpLabel(label)} disabled={write.isBusy || index === 0} onPress={() => setOrder(moveItem(order, index, -1))} variant="ghost">
              ↑
            </LoadingButton>
            <LoadingButton accessibilityLabel={moveDownLabel(label)} disabled={write.isBusy || index === order.length - 1} onPress={() => setOrder(moveItem(order, index, 1))} variant="ghost">
              ↓
            </LoadingButton>
          </View>
        );
      })}
      <LoadingButton disabled={!isDirty} isLoading={write.isBusy} loadingText={MESSAGES.saving} onPress={() => void save()}>
        {MESSAGES.save}
      </LoadingButton>
      <LoadingButton disabled={write.isBusy} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}

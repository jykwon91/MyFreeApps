import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";

interface RowControlsProps {
  /** What the row is called to a screen reader, e.g. "ingredient 2". */
  name: string;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** Up, Down and Remove for one editor row, as the website's arrows and cross do. */
export default function RowControls({ name, isFirst, isLast, disabled, onMove, onRemove }: RowControlsProps) {
  const { colors, spacing, fontSize } = useTheme();

  function control(label: string, accessibilityLabel: string, isDisabled: boolean, onPress: () => void, color = colors.primary) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        hitSlop={spacing.xs}
        onPress={onPress}
        style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", alignItems: "center", opacity: isDisabled ? 0.4 : 1 }}
      >
        <Text style={{ color, fontSize: fontSize.sm, fontWeight: "500" }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm }}>
      {control(MESSAGES.moveUp, MESSAGES.moveUpLabel(name), disabled || isFirst, () => onMove(-1))}
      {control(MESSAGES.moveDown, MESSAGES.moveDownLabel(name), disabled || isLast, () => onMove(1))}
      {control(MESSAGES.remove, MESSAGES.removeLabel(name), disabled, onRemove, colors.destructiveText)}
    </View>
  );
}

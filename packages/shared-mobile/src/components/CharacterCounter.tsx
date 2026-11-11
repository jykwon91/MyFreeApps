import { Text } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { CharacterCounterProps } from "../types/CharacterCounterProps";

/**
 * How much of a limit a field has used, for the eye only. It changes with every keystroke, so it is
 * hidden from screen readers: it is not an alert and is never passed to `useAnnouncement`.
 */
export default function CharacterCounter({ counter, isOver = false }: CharacterCounterProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignSelf: "flex-end", color: isOver ? colors.destructiveText : colors.mutedForeground, fontSize: fontSize.xs }}
      testID="character-counter"
    >
      {counter}
    </Text>
  );
}

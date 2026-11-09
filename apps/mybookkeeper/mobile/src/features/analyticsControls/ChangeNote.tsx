import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import type { ChangeNoteProps } from "../../types/ChangeNoteProps";
import { changeIsGood, changeText, previousText, spokenChange } from "./changeDisplay";

/** How a number moved against the earlier stretch, in words and amounts, never colour alone. Place it beside the figure it explains, not inside a labelled control, or a screen reader never reaches it. */
export default function ChangeNote({ figures, previous, higherIsBetter, againstLabel }: ChangeNoteProps) {
  const { colors, fontSize } = useTheme();
  const good = changeIsGood(figures, higherIsBetter);
  const color = good === null ? colors.mutedForeground : good ? colors.positiveText : colors.destructiveText;
  return (
    <Text accessibilityLabel={`${spokenChange(figures, againstLabel)}. ${previousText(previous)}`} style={{ fontSize: fontSize.sm, color }} testID="change-note">
      {changeText(figures)} · {previousText(previous)}
    </Text>
  );
}

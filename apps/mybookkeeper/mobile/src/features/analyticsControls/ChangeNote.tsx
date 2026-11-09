import type { ChangeFigures } from "@mybookkeeper/api-client/types/analytics/change-figures";
import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { changeIsGood, changeText, previousText, spokenChange } from "./changeDisplay";

/** How a number moved against the earlier stretch, in words and amounts, never colour alone. */
export default function ChangeNote({
  figures,
  previous,
  higherIsBetter,
  againstLabel,
}: {
  figures: ChangeFigures;
  previous: number;
  higherIsBetter: boolean;
  againstLabel: string;
}) {
  const { colors, fontSize } = useTheme();
  const good = changeIsGood(figures, higherIsBetter);
  const color = good === null ? colors.mutedForeground : good ? colors.positiveText : colors.destructiveText;
  return (
    <Text accessibilityLabel={`${spokenChange(figures, againstLabel)}. ${previousText(previous)}`} style={{ fontSize: fontSize.sm, color }} testID="change-note">
      {changeText(figures)} · {previousText(previous)}
    </Text>
  );
}

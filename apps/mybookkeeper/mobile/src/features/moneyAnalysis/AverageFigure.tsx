import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { AverageFigureProps } from "../../types/AverageFigureProps";
import ChangeNote from "../analyticsControls/ChangeNote";
import { spokenMoney } from "../transactions/transactionDisplay";

/** One monthly average. The figure is read as one item and its change beside it, so both are reached. */
export default function AverageFigure({ label, amount, previous, higherIsBetter, text, againstLabel }: AverageFigureProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View accessible accessibilityLabel={`${label}, ${spokenMoney(amount)} a month`} style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
        <Text style={{ fontSize: fontSize.lg, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{text}</Text>
      </View>
      {previous === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(amount, previous)} higherIsBetter={higherIsBetter} previous={previous} />}
    </View>
  );
}

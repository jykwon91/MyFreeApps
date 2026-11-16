import { LabelValueRow, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import { View } from "react-native";
import type { UtilityCostRow } from "../../types/UtilityCostRow";
import ChangeNote from "../analyticsControls/ChangeNote";
import { spokenMoney } from "../transactions/transactionDisplay";
import UtilityCostBar from "./UtilityCostBar";
import { barPercent } from "./utilityCostsDisplay";

interface UtilityCostRowViewProps {
  row: UtilityCostRow;
  totalCents: number;
  /** What this utility came to in the stretch compared against, in cents; null when not comparing. */
  previousCents: number | null;
  againstLabel: string;
}

export default function UtilityCostRowView({ row, totalCents, previousCents, againstLabel }: UtilityCostRowViewProps) {
  const { spacing } = useTheme();
  const dollars = row.cents / 100;
  return (
    <View accessible accessibilityLabel={`${row.label}, ${spokenMoney(dollars)}`} style={{ gap: spacing.xs }}>
      <LabelValueRow accessible={false} label={row.label} labelTone="foreground" value={formatCurrency(dollars)} valueWeight="600" />
      <UtilityCostBar percent={barPercent(row.cents, totalCents)} />
      {previousCents === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(dollars, previousCents / 100)} higherIsBetter={false} previous={previousCents / 100} />}
    </View>
  );
}

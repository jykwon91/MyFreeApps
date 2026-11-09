import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import HomeCard from "../home/HomeCard";
import { moneySign } from "../transactions/transactionDisplay";
import TotalFigure from "./TotalFigure";

interface TotalsCardProps {
  summary: SummaryResponse;
  previous: SummaryResponse | null;
  againstLabel: string;
  onOpen: (kind: "revenue" | "expenses") => void;
}

/** Net first, then what it was made of. Revenue and expenses open the rows behind them. */
export default function TotalsCard({ summary, previous, againstLabel, onOpen }: TotalsCardProps) {
  const { colors, fontSize } = useTheme();
  return (
    <HomeCard testID="analysis-totals">
      <TotalFigure againstLabel={againstLabel} amount={summary.profit} higherIsBetter isSigned label={MESSAGES.net} previous={previous ? previous.profit : null} />
      {moneySign(summary.profit) < 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{MESSAGES.loseMoney}</Text> : null}
      <View style={{ gap: 8 }}>
        <TotalFigure againstLabel={againstLabel} amount={summary.revenue} higherIsBetter label={MESSAGES.revenue} onPress={() => onOpen("revenue")} previous={previous ? previous.revenue : null} />
        <TotalFigure againstLabel={againstLabel} amount={summary.expenses} higherIsBetter={false} label={MESSAGES.expenses} onPress={() => onOpen("expenses")} previous={previous ? previous.expenses : null} />
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.approvedOnly}</Text>
    </HomeCard>
  );
}

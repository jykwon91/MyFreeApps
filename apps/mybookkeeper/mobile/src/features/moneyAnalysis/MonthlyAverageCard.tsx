import { useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { MonthlyAverageCardProps } from "../../types/MonthlyAverageCardProps";
import HomeCard from "../home/HomeCard";
import { signedMoney } from "../transactions/transactionDisplay";
import AverageFigure from "./AverageFigure";

/** What a month with activity brings in and costs, on average, with the earlier stretch's averages when comparing. */
export default function MonthlyAverageCard({ average, previous, againstLabel }: MonthlyAverageCardProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <HomeCard title={MESSAGES.monthlyAverage}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.acrossMonths(average.months)}</Text>
      <View style={{ gap: spacing.md }}>
        <AverageFigure againstLabel={againstLabel} amount={average.revenue} higherIsBetter label={MESSAGES.revenue} previous={previous ? previous.revenue : null} text={formatCurrency(average.revenue)} />
        <AverageFigure againstLabel={againstLabel} amount={average.expenses} higherIsBetter={false} label={MESSAGES.expenses} previous={previous ? previous.expenses : null} text={formatCurrency(average.expenses)} />
        <AverageFigure againstLabel={againstLabel} amount={average.profit} higherIsBetter label={MESSAGES.profit} previous={previous ? previous.profit : null} text={signedMoney(average.profit)} />
      </View>
    </HomeCard>
  );
}

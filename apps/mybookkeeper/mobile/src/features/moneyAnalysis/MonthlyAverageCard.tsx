import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import type { MonthlyAverage } from "@mybookkeeper/api-client/types/summary/MonthlyAverage";
import { useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import ChangeNote from "../analyticsControls/ChangeNote";
import HomeCard from "../home/HomeCard";
import { signedMoney, spokenMoney } from "../transactions/transactionDisplay";

function Figure({ label, amount, previous, higherIsBetter, text, againstLabel }: { label: string; amount: number; previous: number | null; higherIsBetter: boolean; text: string; againstLabel: string }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}, ${spokenMoney(amount)} a month`} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.lg, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{text}</Text>
      {previous === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(amount, previous)} higherIsBetter={higherIsBetter} previous={previous} />}
    </View>
  );
}

/** What a month with activity brings in and costs, on average, with the earlier stretch's averages when comparing. */
export default function MonthlyAverageCard({ average, previous, againstLabel }: { average: MonthlyAverage; previous: MonthlyAverage | null; againstLabel: string }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <HomeCard title={MESSAGES.monthlyAverage}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.acrossMonths(average.months)}</Text>
      <View style={{ gap: spacing.md }}>
        <Figure againstLabel={againstLabel} amount={average.revenue} higherIsBetter label={MESSAGES.revenue} previous={previous ? previous.revenue : null} text={formatCurrency(average.revenue)} />
        <Figure againstLabel={againstLabel} amount={average.expenses} higherIsBetter={false} label={MESSAGES.expenses} previous={previous ? previous.expenses : null} text={formatCurrency(average.expenses)} />
        <Figure againstLabel={againstLabel} amount={average.profit} higherIsBetter label={MESSAGES.profit} previous={previous ? previous.profit : null} text={signedMoney(average.profit)} />
      </View>
    </HomeCard>
  );
}

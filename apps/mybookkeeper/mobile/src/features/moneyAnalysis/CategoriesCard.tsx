import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import type { CategoryTotal } from "../../types/CategoryTotal";
import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { HOME_CATEGORY_BAR_HEIGHT } from "../../constants/home";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisScope } from "../../types/AnalysisScope";
import ChangeNote from "../analyticsControls/ChangeNote";
import { drillDownLink } from "../drillDown/drillDownLink";
import HomeCard from "../home/HomeCard";
import { categoryLabel, spokenMoney } from "../transactions/transactionDisplay";
import { categoryGroups } from "./moneyAnalysisDisplay";
import { categoryDrillDown } from "./moneyAnalysisDrillDowns";

interface CategoriesCardProps {
  byCategory: Readonly<Record<string, number>>;
  previous: Readonly<Record<string, number>> | null;
  againstLabel: string;
  scope: AnalysisScope;
}

function GroupHeading({ children }: { children: string }) {
  const { colors, fontSize } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
      {children}
    </Text>
  );
}

function CategoryRow({ row, largest, previous, againstLabel, higherIsBetter, scope }: { row: CategoryTotal; largest: number; previous: number | null; againstLabel: string; higherIsBetter: boolean; scope: AnalysisScope }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const label = categoryLabel(row.category);
  return (
    <View>
      <Pressable
        accessibilityLabel={`${label}, ${spokenMoney(row.amount)}`}
        accessibilityRole="button"
        onPress={() => router.navigate(drillDownLink(categoryDrillDown(row.category, scope)))}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", gap: spacing.xs }}
      >
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{label}</Text>
          <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: colors.foreground }}>{formatCurrency(row.amount)}</Text>
        </View>
        <View style={{ height: HOME_CATEGORY_BAR_HEIGHT, borderRadius: radius.sm, backgroundColor: colors.muted }}>
          <View style={{ width: `${Math.min(100, (Math.abs(row.amount) / largest) * 100)}%`, height: "100%", borderRadius: radius.sm, backgroundColor: higherIsBetter ? colors.positiveText : colors.destructiveText }} />
        </View>
      </Pressable>
      {previous === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(row.amount, previous)} higherIsBetter={higherIsBetter} previous={previous} />}
    </View>
  );
}

/** Every category with money in it, income apart from expenses, each with a bar sized against the biggest in its group. */
export default function CategoriesCard({ byCategory, previous, againstLabel, scope }: CategoriesCardProps) {
  const groups = categoryGroups(byCategory);
  if (groups.length === 0) return null;
  return (
    <HomeCard title={MESSAGES.byCategory}>
      {groups.map((group) => {
        const largest = Math.max(...group.rows.map((row) => Math.abs(row.amount)));
        return (
          <View accessibilityLabel={group.heading} accessibilityRole="list" key={group.heading}>
            <GroupHeading>{group.heading}</GroupHeading>
            {group.rows.map((row) => (
              <CategoryRow againstLabel={againstLabel} higherIsBetter={group.heading === MESSAGES.income} key={row.category} largest={largest} previous={previous ? (previous[row.category] ?? 0) : null} row={row} scope={scope} />
            ))}
          </View>
        );
      })}
    </HomeCard>
  );
}

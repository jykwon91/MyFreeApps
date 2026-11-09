import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { HOME_CATEGORY_BAR_HEIGHT } from "../../constants/home";
import type { AnalysisScope } from "../../types/AnalysisScope";
import type { CategoryGroupKind } from "../../types/CategoryGroupKind";
import type { CategoryTotal } from "../../types/CategoryTotal";
import ChangeNote from "../analyticsControls/ChangeNote";
import { drillDownLink } from "../drillDown/drillDownLink";
import { categoryLabel, spokenMoney } from "../transactions/transactionDisplay";
import { categoryDrillDown } from "./moneyAnalysisDrillDowns";

interface CategoryRowProps {
  row: CategoryTotal;
  kind: CategoryGroupKind;
  /** The biggest amount in the group, which the bars are sized against. */
  largest: number;
  /** What it was in the stretch compared against, or null when not comparing. */
  previous: number | null;
  againstLabel: string;
  scope: AnalysisScope;
}

/** One category: its amount and a bar, opening the transactions behind it. Income is green, expenses red, anything else neutral. */
export default function CategoryRow({ row, kind, largest, previous, againstLabel, scope }: CategoryRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const label = categoryLabel(row.category);
  const barColor = kind === "income" ? colors.positiveText : kind === "expenses" ? colors.destructiveText : colors.mutedForeground;
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
          <View testID={`category-bar-${row.category}`} style={{ width: `${Math.min(100, (Math.abs(row.amount) / largest) * 100)}%`, height: "100%", borderRadius: radius.sm, backgroundColor: barColor }} />
        </View>
      </Pressable>
      {previous === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(row.amount, previous)} higherIsBetter={kind === "income"} previous={previous} />}
    </View>
  );
}

import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { View } from "react-native";
import HomeCard from "../home/HomeCard";
import CategoryRow from "./CategoryRow";
import GroupHeading from "./GroupHeading";
import { categoryGroups } from "./moneyAnalysisDisplay";

interface CategoriesCardProps {
  byCategory: Readonly<Record<string, number>>;
  previous: Readonly<Record<string, number>> | null;
  againstLabel: string;
  scope: AnalysisScope;
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
          <View accessibilityLabel={group.heading} accessibilityRole="list" key={group.kind}>
            <GroupHeading>{group.heading}</GroupHeading>
            {group.rows.map((row) => (
              <CategoryRow againstLabel={againstLabel} key={row.category} kind={group.kind} largest={largest} previous={previous ? (previous[row.category] ?? 0) : null} row={row} scope={scope} />
            ))}
          </View>
        );
      })}
    </HomeCard>
  );
}

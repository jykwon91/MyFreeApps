import { router } from "expo-router";
import type { HomePeriod } from "../../constants/home";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { categoryLabel } from "../transactions/transactionDisplay";
import CategoryBarRow from "./CategoryBarRow";
import HomeCard from "./HomeCard";
import { topExpenseCategories } from "./homeCharts";
import HomeLinkRow from "./HomeLinkRow";
import { allExpensesLink, categoryLink } from "./homeLinks";

/** The biggest expense categories for the period, each opening the rows behind it. */
export default function WhereItWent({ byCategory, period, scope }: { byCategory: Readonly<Record<string, number>>; period: HomePeriod; scope: AnalysisScope }) {
  const categories = topExpenseCategories(byCategory);
  if (categories.length === 0) return null;

  return (
    <HomeCard title="Where it went">
      {categories.map((row) => (
        <CategoryBarRow
          amount={row.amount}
          key={row.category}
          label={categoryLabel(row.category)}
          largest={categories[0].amount}
          onPress={() => router.navigate(categoryLink(row.category, period, scope))}
        />
      ))}
      <HomeLinkRow label="See all expenses" onPress={() => router.navigate(allExpensesLink(period, scope))} />
    </HomeCard>
  );
}

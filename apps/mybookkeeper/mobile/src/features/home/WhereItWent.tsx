import { router } from "expo-router";
import type { HomePeriod } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { categoryLabel } from "../transactions/transactionDisplay";
import { transactionsLink } from "../transactions/transactionFilters";
import CategoryBarRow from "./CategoryBarRow";
import HomeCard from "./HomeCard";
import { topExpenseCategories } from "./homeCharts";
import HomeLinkRow from "./HomeLinkRow";

/** The biggest expense categories for the period, each opening the rows behind it. */
export default function WhereItWent({ byCategory, period }: { byCategory: Readonly<Record<string, number>>; period: HomePeriod }) {
  const categories = topExpenseCategories(byCategory);
  if (categories.length === 0) return null;
  const expenses = { ...NO_FILTERS, period, type: "expense" as const, approvedOnly: true };

  return (
    <HomeCard title="Where it went">
      {categories.map((row) => (
        <CategoryBarRow
          amount={row.amount}
          key={row.category}
          label={categoryLabel(row.category)}
          largest={categories[0].amount}
          onPress={() => router.navigate(transactionsLink({ ...expenses, category: row.category }))}
        />
      ))}
      <HomeLinkRow label="See all expenses" onPress={() => router.navigate(transactionsLink(expenses))} />
    </HomeCard>
  );
}

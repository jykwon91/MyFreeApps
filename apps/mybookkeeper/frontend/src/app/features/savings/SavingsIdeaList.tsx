import { SAVINGS_CATEGORIES } from "@mybookkeeper/api-client/constants/savings";
import type { SavingsCategory } from "@mybookkeeper/api-client/types/savings/savings-category";
import type { SavingsIdea } from "@mybookkeeper/api-client/types/savings/savings-idea";
import EmptyState from "@/shared/components/ui/EmptyState";
import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";
import { SAVINGS_CATEGORY_LABELS, SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import SavingsIdeaCard from "./SavingsIdeaCard";

export interface SavingsIdeaListProps {
  ideas: SavingsIdea[];
  category: SavingsCategory | null;
  onCategoryChange: (next: SavingsCategory | null) => void;
}

/** Chips for the categories that have ideas, then the ideas, biggest saving first (the server's order). */
export default function SavingsIdeaList({ ideas, category, onCategoryChange }: SavingsIdeaListProps) {
  const present = new Set(ideas.map((idea) => idea.category));
  const options: FilterChipOption<SavingsCategory>[] = [
    { value: null, label: MSG.allCategories },
    ...SAVINGS_CATEGORIES.filter((key) => present.has(key)).map((key) => ({
      value: key,
      label: SAVINGS_CATEGORY_LABELS[key],
    })),
  ];
  const shown = category === null ? ideas : ideas.filter((idea) => idea.category === category);

  return (
    <div className="space-y-3">
      <FilterChipRow
        options={options}
        value={category}
        onChange={onCategoryChange}
        ariaLabel={MSG.filterLabel}
        testIdPrefix="savings-filter"
      />
      {shown.length === 0 ? (
        <EmptyState message={MSG.emptyCategory} />
      ) : (
        <ul className="space-y-2" data-testid="savings-ideas">
          {shown.map((idea) => (
            <SavingsIdeaCard key={idea.id} idea={idea} />
          ))}
        </ul>
      )}
    </div>
  );
}

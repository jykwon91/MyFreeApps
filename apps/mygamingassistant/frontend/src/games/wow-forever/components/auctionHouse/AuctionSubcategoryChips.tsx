import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import FilterChipsSkeleton from "@/games/wow-forever/components/auctionHouse/FilterChipsSkeleton";
import { ALL_SUBCATEGORIES_ID, AUCTION_CATEGORY_LABELS } from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import { allSubcategoriesLabel, FILTER_PANEL_COPY, subcategoryLegend } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { GEAR_SKELETON_CHIPS } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { ItemCategoriesState } from "@/games/wow-forever/hooks/useItemCategories";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";

interface AuctionSubcategoryChipsProps {
  category: AuctionCategory;
  /** The chosen subclass id; null = all of the category. */
  subcategory: number | null;
  onSubcategory: (subcategory: number | null) => void;
  categories: ItemCategoriesState;
}

/** The chosen category's subclasses (Potions, Elixirs ...) as the game names them, once the categories have loaded. */
export default function AuctionSubcategoryChips({ category, subcategory, onSubcategory, categories }: AuctionSubcategoryChipsProps) {
  if (categories.status === LOAD_STATUS.loading) {
    return <FilterChipsSkeleton label={FILTER_PANEL_COPY.categoryLoading} count={GEAR_SKELETON_CHIPS} testId="auction-category-skeleton" />;
  }
  if (categories.status === LOAD_STATUS.error) {
    return <LoadErrorRetry message={FILTER_PANEL_COPY.categoryError} onRetry={categories.retry} retrying={categories.retrying} />;
  }
  const label = AUCTION_CATEGORY_LABELS[category];
  const options: AuctionChipOption<string>[] = [
    { id: ALL_SUBCATEGORIES_ID, label: allSubcategoriesLabel(label) },
    ...(categories.index.subclasses.get(category) ?? []).map((s) => ({ id: String(s.id), label: s.label })),
  ];
  return (
    <AuctionFilterChips
      legend={subcategoryLegend(label)}
      options={options}
      value={[subcategory === null ? ALL_SUBCATEGORIES_ID : String(subcategory)]}
      onToggle={(id) => onSubcategory(id === ALL_SUBCATEGORIES_ID ? null : Number(id))}
      testId="auction-filter-subcategory"
    />
  );
}

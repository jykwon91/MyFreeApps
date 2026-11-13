import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import AuctionSubcategoryChips from "@/games/wow-forever/components/auctionHouse/AuctionSubcategoryChips";
import { AUCTION_CATEGORY_CHIPS, GEAR_CATEGORY } from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import { FILTER_PANEL_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import type { ItemCategoriesState } from "@/games/wow-forever/hooks/useItemCategories";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionCategoryFiltersProps {
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  /** The item categories; asked for only once a category is picked (or a link already has one). */
  categories: ItemCategoriesState;
}

/** One category (Consumable, Trade Goods ...) and, under it, one of its subclasses. */
export default function AuctionCategoryFilters({ filters, onFilters, categories }: AuctionCategoryFiltersProps) {
  const { category } = filters;
  return (
    <div className="space-y-3" data-testid="auction-category-group">
      <AuctionFilterChips
        legend={FILTER_PANEL_COPY.category}
        options={AUCTION_CATEGORY_CHIPS}
        value={category ? [category] : []}
        onToggle={(picked) => onFilters({ category: picked === category ? null : picked, subcategory: null })}
        testId="auction-filter-category"
      />
      {category === GEAR_CATEGORY && <p className="text-sm text-muted-foreground">{FILTER_PANEL_COPY.gearCategoryHint}</p>}
      {category !== null && category !== GEAR_CATEGORY && (
        <AuctionSubcategoryChips
          category={category}
          subcategory={filters.subcategory}
          onSubcategory={(subcategory) => onFilters({ subcategory })}
          categories={categories}
        />
      )}
    </div>
  );
}

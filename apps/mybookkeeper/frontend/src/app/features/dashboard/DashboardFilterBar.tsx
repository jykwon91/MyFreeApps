import { useState } from "react";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { INCOME_CATEGORY_LIST, EXPENSE_CATEGORY_LIST_FILTER } from "@/shared/lib/dashboard-filter-config";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import CategoryChip from "@/app/features/dashboard/CategoryChip";
import type { CategoryFilterPreset, CategoryFilterState } from "@/shared/types/dashboard/category-filter";
import type { Property } from "@/shared/types/property/property";

export interface DashboardFilterBarProps {
  filterState: CategoryFilterState;
  onToggleCategory: (category: string) => void;
  onSelectOnlyCategory: (category: string) => void;
  onSetPreset: (preset: CategoryFilterPreset) => void;
  onResetCategories: () => void;
  isFiltered: boolean;
  properties: Property[];
  selectedPropertyIds: string[];
  onPropertyIdsChange: (ids: string[]) => void;
}

const PRESETS: { key: CategoryFilterPreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
];

export default function DashboardFilterBar({
  filterState,
  onToggleCategory,
  onSelectOnlyCategory,
  onSetPreset,
  onResetCategories,
  isFiltered,
  properties,
  selectedPropertyIds,
  onPropertyIdsChange,
}: DashboardFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [touchedGroups, setTouchedGroups] = useState<Set<string>>(new Set());
  const { selectedCategories, preset } = filterState;

  const selectedCount = selectedCategories.size;
  const totalCount = INCOME_CATEGORY_LIST.length + EXPENSE_CATEGORY_LIST_FILTER.length;

  const incomeUntouched = !touchedGroups.has("income") && INCOME_CATEGORY_LIST.every((cat) => selectedCategories.has(cat));
  const expenseUntouched = !touchedGroups.has("expenses") && EXPENSE_CATEGORY_LIST_FILTER.every((cat) => selectedCategories.has(cat));

  const hasPropertyFilter = selectedPropertyIds.length > 0;
  const hasAnyFilter = isFiltered || hasPropertyFilter;

  return (
    <div className="bg-card border rounded-lg" data-testid="dashboard-filter-bar">
      {/* Compact bar: property dropdown + category presets + toggle — entire row expands */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-wrap cursor-pointer"
        onClick={(e) => {
          // Don't toggle if clicking on interactive children (buttons, dropdowns)
          const target = e.target as HTMLElement;
          if (target.closest("button, [role='menu'], [role='menuitemcheckbox'], [data-radix-collection-item]")) return;
          setExpanded((prev) => !prev);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((prev) => !prev); } }}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter size={16} />
          <span className="text-sm font-medium hidden sm:inline">Filters</span>
        </div>

        {/* Property multi-select */}
        {properties.length > 0 && (
          <PropertyMultiSelect
            properties={properties}
            selectedIds={selectedPropertyIds}
            onChange={onPropertyIdsChange}
          />
        )}

        {/* Separator between property and category filters */}
        {properties.length > 0 && (
          <div className="h-6 w-px bg-border hidden sm:block" aria-hidden />
        )}

        {/* Category preset buttons */}
        <div className="flex gap-1.5">
          {PRESETS.map((p) => {
            const isActive = p.key === "all" ? !isFiltered : preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { onSetPreset(p.key); setTouchedGroups(new Set()); }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] sm:min-h-[32px]",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted",
                )}
                data-testid={`filter-preset-${p.key}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Filter count + expand toggle */}
        <div className="flex items-center gap-2 ml-auto">
          {isFiltered && (
            <span className="text-xs text-muted-foreground" data-testid="filter-count">
              {selectedCount} of {totalCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px] sm:min-h-[32px] px-2"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse category chips" : "Expand category chips"}
            data-testid="filter-expand-toggle"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span className="hidden sm:inline">{expanded ? "Less" : "More"}</span>
          </button>
        </div>
      </div>

      {/* Expanded: individual category chips */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t" data-testid="filter-categories-panel">
          {/* Reset button — visible when any filter is active */}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={() => {
                onResetCategories();
                onPropertyIdsChange([]);
                setTouchedGroups(new Set());
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="filter-clear"
            >
              <X size={12} />
              <span>Reset all filters</span>
            </button>
          )}
          {/* Income categories */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Income</p>
            <div className="flex flex-wrap gap-2">
              {INCOME_CATEGORY_LIST.map((cat) => (
                <CategoryChip
                  key={cat}
                  category={cat}
                  selected={selectedCategories.has(cat)}
                  allSelected={incomeUntouched}
                  onToggle={(c) => { setTouchedGroups((s) => new Set(s).add("income")); onToggleCategory(c); }}
                  onSelectOnly={(c) => { setTouchedGroups((s) => new Set(s).add("income")); onSelectOnlyCategory(c); }}
                />
              ))}
            </div>
          </div>

          {/* Expense categories */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Expenses</p>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORY_LIST_FILTER.map((cat) => (
                <CategoryChip
                  key={cat}
                  category={cat}
                  selected={selectedCategories.has(cat)}
                  allSelected={expenseUntouched}
                  onToggle={(c) => { setTouchedGroups((s) => new Set(s).add("expenses")); onToggleCategory(c); }}
                  onSelectOnly={(c) => { setTouchedGroups((s) => new Set(s).add("expenses")); onSelectOnlyCategory(c); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import type { Property } from "@/shared/types/property/property";

type Granularity = "monthly" | "quarterly";

interface Props {
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  propertyIds: string[];
  properties: Property[];
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onGranularity: (v: Granularity) => void;
  onPropertyIds: (ids: string[]) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}

export default function AnalyticsFilters({
  fromDate,
  toDate,
  granularity,
  propertyIds,
  properties,
  onFromDate,
  onToDate,
  onGranularity,
  onPropertyIds,
  hasActiveFilters,
  onClear,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const filterContent = (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="filter-from">From date</label>
        <input
          id="filter-from"
          type="date"
          value={fromDate}
          onChange={(e) => onFromDate(e.target.value)}
          className="h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <label className="sr-only" htmlFor="filter-to">To date</label>
        <input
          id="filter-to"
          type="date"
          value={toDate}
          onChange={(e) => onToDate(e.target.value)}
          className="h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Granularity toggle */}
      <div
        role="radiogroup"
        aria-label="Chart granularity"
        className="flex items-center border rounded-md overflow-hidden"
      >
        {(["monthly", "quarterly"] as const).map((g) => (
          <button
            key={g}
            role="radio"
            aria-checked={granularity === g}
            onClick={() => onGranularity(g)}
            className={cn(
              "h-9 px-4 text-sm font-medium transition-colors",
              granularity === g
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {g === "monthly" ? "Monthly" : "Quarterly"}
          </button>
        ))}
      </div>

      {/* Property multi-select */}
      {properties.length > 0 && (
        <PropertyMultiSelect
          properties={properties}
          selectedIds={propertyIds}
          onChange={onPropertyIds}
          maxSelected={4}
        />
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 h-9 px-3 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted transition-colors"
          aria-label="Clear all filters"
        >
          <X size={14} />
          Clear
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden sm:block">{filterContent}</div>

      {/* Mobile: toggle */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex items-center gap-2 h-9 px-3 text-sm border rounded-md bg-background hover:bg-muted transition-colors"
          aria-expanded={mobileOpen}
          aria-controls="mobile-filters"
        >
          <SlidersHorizontal size={15} />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
          )}
        </button>
        {mobileOpen && (
          <div id="mobile-filters" className="mt-3 flex flex-col gap-3">
            {filterContent}
          </div>
        )}
      </div>
    </>
  );
}

import { useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import CollapsibleFilters from "@/shared/components/ui/CollapsibleFilters";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import type { Property } from "@mybookkeeper/api-client/types/property/property";

type Granularity = "monthly" | "quarterly";

export interface AnalyticsFiltersProps {
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  propertyIds: string[];
  properties: Property[];
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onGranularity: (v: Granularity) => void;
  onPropertyIds: (ids: string[]) => void;
  activeFilterCount: number;
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
  activeFilterCount,
  onClear,
}: AnalyticsFiltersProps) {
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;

  return (
    <CollapsibleFilters activeCount={activeFilterCount} breakpoint="sm">
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={fromId}>From date</label>
        <input
          id={fromId}
          type="date"
          value={fromDate}
          onChange={(e) => onFromDate(e.target.value)}
          className="h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <label className="sr-only" htmlFor={toId}>To date</label>
        <input
          id={toId}
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
            type="button"
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
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 h-9 px-3 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted transition-colors"
          aria-label="Clear all filters"
        >
          <X size={14} />
          Clear
        </button>
      )}
    </CollapsibleFilters>
  );
}

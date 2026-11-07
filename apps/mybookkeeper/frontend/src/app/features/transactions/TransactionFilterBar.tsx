import { formatTag } from "@/shared/utils/tag";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import { STATUS_OPTIONS, TYPE_OPTIONS, ALL_CATEGORIES, EMPTY_FILTERS } from "@/shared/lib/transaction-config";
import Select from "@/shared/components/ui/Select";
import CollapsibleFilters from "@/shared/components/ui/CollapsibleFilters";

export interface TransactionFilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  properties: readonly Property[];
}

export default function TransactionFilterBar({ filters, onChange, properties }: TransactionFilterBarProps) {
  function update(field: keyof Filters, value: string) {
    onChange({ ...filters, [field]: value });
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <CollapsibleFilters activeCount={activeFilterCount} breakpoint="md">
      <Select aria-label="Filter by property" value={filters.property_id} onChange={(e) => update("property_id", e.target.value)} className="text-xs py-1.5">
        <option value="">All Properties</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>

      <Select aria-label="Filter by status" value={filters.status} onChange={(e) => update("status", e.target.value)} className="text-xs py-1.5">
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{formatTag(s)}</option>
        ))}
      </Select>

      <Select aria-label="Filter by type" value={filters.transaction_type} onChange={(e) => update("transaction_type", e.target.value)} className="text-xs py-1.5">
        <option value="">All Types</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t === "income" ? "Income" : "Expense"}</option>
        ))}
      </Select>

      <Select aria-label="Filter by category" value={filters.category} onChange={(e) => update("category", e.target.value)} className="text-xs py-1.5">
        <option value="">All Categories</option>
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c}>{formatTag(c)}</option>
        ))}
      </Select>

      <input
        type="text"
        value={filters.vendor}
        onChange={(e) => update("vendor", e.target.value)}
        placeholder="Filter by vendor"
        aria-label="Filter by vendor"
        className="border rounded-md px-2 py-1.5 text-xs bg-background"
      />

      <input
        type="date"
        value={filters.start_date}
        onChange={(e) => update("start_date", e.target.value)}
        aria-label="Filter from date"
        className="border rounded-md px-2 py-1.5 text-xs"
        placeholder="From"
      />

      <input
        type="date"
        value={filters.end_date}
        onChange={(e) => update("end_date", e.target.value)}
        aria-label="Filter to date"
        className="border rounded-md px-2 py-1.5 text-xs"
        placeholder="To"
      />

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-primary hover:underline font-medium"
        >
          Clear filters
        </button>
      )}
    </CollapsibleFilters>
  );
}

import { useState } from "react";
import { Filter } from "lucide-react";
import { formatTag } from "@/shared/utils/tag";
import type { Property } from "@/shared/types/property/property";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import { STATUS_OPTIONS, TYPE_OPTIONS, ALL_CATEGORIES } from "@/shared/lib/transaction-config";
import Select from "@/shared/components/ui/Select";
import Badge from "@/shared/components/ui/Badge";

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  properties: readonly Property[];
}

export default function TransactionFilterBar({ filters, onChange, properties }: Props) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  function update(field: keyof Filters, value: string) {
    onChange({ ...filters, [field]: value });
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filterControls = (
    <>
      <Select value={filters.property_id} onChange={(e) => update("property_id", e.target.value)} className="text-xs py-1.5">
        <option value="">All Properties</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>

      <Select value={filters.status} onChange={(e) => update("status", e.target.value)} className="text-xs py-1.5">
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{formatTag(s)}</option>
        ))}
      </Select>

      <Select value={filters.transaction_type} onChange={(e) => update("transaction_type", e.target.value)} className="text-xs py-1.5">
        <option value="">All Types</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t === "income" ? "Income" : "Expense"}</option>
        ))}
      </Select>

      <Select value={filters.category} onChange={(e) => update("category", e.target.value)} className="text-xs py-1.5">
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
        className="border rounded-md px-2 py-1.5 text-xs bg-background"
      />

      <input
        type="date"
        value={filters.start_date}
        onChange={(e) => update("start_date", e.target.value)}
        className="border rounded-md px-2 py-1.5 text-xs"
        placeholder="From"
      />

      <input
        type="date"
        value={filters.end_date}
        onChange={(e) => update("end_date", e.target.value)}
        className="border rounded-md px-2 py-1.5 text-xs"
        placeholder="To"
      />

      {hasFilters && (
        <button
          onClick={() => onChange({ property_id: "", status: "", transaction_type: "", category: "", vendor: "", start_date: "", end_date: "" })}
          className="text-xs text-primary hover:underline font-medium"
        >
          Clear filters
        </button>
      )}
    </>
  );

  return (
    <div>
      {/* Mobile: toggle button */}
      <button
        onClick={() => setMobileExpanded((p) => !p)}
        className="md:hidden inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-[44px]"
      >
        <Filter size={14} />
        Filters
        {activeFilterCount > 0 && <Badge label={String(activeFilterCount)} color="blue" />}
      </button>

      {/* Mobile: expandable filter section */}
      {mobileExpanded && (
        <div className="md:hidden flex flex-wrap items-center gap-2 mt-2">
          {filterControls}
        </div>
      )}

      {/* Desktop: always visible */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        {filterControls}
      </div>
    </div>
  );
}

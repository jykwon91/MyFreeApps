import { useCallback, useEffect, useRef, useState } from "react";
import { type Column } from "@tanstack/react-table";
import { Filter, X } from "lucide-react";

export interface ColumnFilterProps<TData = unknown> {
  column: Column<TData, unknown>;
  options?: { value: string; label: string }[];
  enableDateRange?: boolean;
}

export default function ColumnFilter<TData = unknown>({ column, options, enableDateRange }: ColumnFilterProps<TData>) {
  if (enableDateRange) {
    return <DateRangeFilter column={column} />;
  }

  if (options) {
    return <MultiSelectFilter column={column} options={options} />;
  }

  return null;
}

function DateRangeFilter<TData = unknown>({ column }: { column: Column<TData, unknown> }) {
  const value = (column.getFilterValue() as [string, string] | undefined) ?? ["", ""];

  return (
    <div className="flex gap-1">
      <input
        type="date"
        value={value[0]}
        onChange={(e) => column.setFilterValue([e.target.value, value[1]])}
        className="border rounded px-1.5 py-1 text-xs bg-background w-[110px]"
        aria-label="From date"
      />
      <input
        type="date"
        value={value[1]}
        onChange={(e) => column.setFilterValue([value[0], e.target.value])}
        className="border rounded px-1.5 py-1 text-xs bg-background w-[110px]"
        aria-label="To date"
      />
    </div>
  );
}

function MultiSelectFilter<TData = unknown>({
  column,
  options,
}: {
  column: Column<TData, unknown>;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const hasFilter = selected.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const toggle = useCallback(
    (value: string) => {
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      column.setFilterValue(next.length > 0 ? next : undefined);
    },
    [selected, column],
  );

  const clear = useCallback(() => {
    column.setFilterValue(undefined);
    setOpen(false);
  }, [column]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`flex items-center gap-1 text-xs px-1.5 py-1 rounded border transition-colors ${
          hasFilter
            ? "border-primary bg-primary/10 text-primary"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
        }`}
        aria-label={`Filter ${column.id}`}
      >
        <Filter className="h-3 w-3" />
        {hasFilter ? <span>{selected.length}</span> : null}
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full mt-1 bg-card border rounded-md shadow-lg z-30 py-1 min-w-[160px] max-h-[240px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {hasFilter ? (
            <button
              onClick={clear}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-muted"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          ) : null}
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

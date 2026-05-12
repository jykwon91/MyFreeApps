import { cn } from "@/shared/utils/cn";
import type { YearOption } from "@/shared/types/dashboard/year-option";

export interface YearFilterProps {
  value: YearOption;
  onChange: (year: YearOption) => void;
  availableYears: number[];
  className?: string;
}

export default function YearFilter({
  value,
  onChange,
  availableYears,
  className,
}: YearFilterProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    if (raw === "all") {
      onChange("all");
    } else {
      onChange(Number(raw));
    }
  }

  return (
    <select
      value={value === "all" ? "all" : String(value)}
      onChange={handleChange}
      data-testid="year-filter"
      aria-label="Filter by year"
      className={cn(
        "rounded-md border border-border px-3 text-xs font-medium text-muted-foreground",
        "hover:bg-muted transition-colors cursor-pointer",
        "min-h-[36px] sm:min-h-[32px]",
        className,
      )}
    >
      <option value="all">All time</option>
      {availableYears.map((year) => (
        <option key={year} value={String(year)}>
          {year}
        </option>
      ))}
    </select>
  );
}

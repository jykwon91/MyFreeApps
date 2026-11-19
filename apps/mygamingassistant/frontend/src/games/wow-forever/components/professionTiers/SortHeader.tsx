import { ArrowDown, ArrowUp } from "lucide-react";
import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";

interface SortHeaderProps<K extends string> {
  sortKey: K;
  label: string;
  sort: ProfessionSort<K>;
  onSort: (key: K) => void;
}

function ariaSort<K extends string>(sort: ProfessionSort<K>, key: K): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

/** A sortable column title: a 44px button with the current direction's arrow, and `aria-sort` on the header. */
export default function SortHeader<K extends string>({ sortKey, label, sort, onSort }: SortHeaderProps<K>) {
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div role="columnheader" aria-sort={ariaSort(sort, sortKey)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        {sort.key === sortKey ? <Arrow className="h-3 w-3" aria-hidden /> : null}
      </button>
    </div>
  );
}

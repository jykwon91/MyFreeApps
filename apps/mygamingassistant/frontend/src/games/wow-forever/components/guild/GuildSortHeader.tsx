import { ArrowDown, ArrowUp } from "lucide-react";
import { GUILD_SORT_LABELS, type GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";

interface GuildSortHeaderProps {
  column: GuildSortKey;
  sort: GuildSortKey;
  descending: boolean;
  onSort: (column: GuildSortKey) => void;
  className?: string;
}

/** A member-table column header that sorts by its column; again reverses. */
export default function GuildSortHeader({ column, sort, descending, onSort, className }: GuildSortHeaderProps) {
  const active = column === sort;
  let ariaSort: "ascending" | "descending" | "none" = "none";
  if (active) ariaSort = descending ? "descending" : "ascending";
  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {GUILD_SORT_LABELS[column]}
        {active && descending ? <ArrowDown className="h-3 w-3" aria-hidden /> : null}
        {active && !descending ? <ArrowUp className="h-3 w-3" aria-hidden /> : null}
      </button>
    </th>
  );
}

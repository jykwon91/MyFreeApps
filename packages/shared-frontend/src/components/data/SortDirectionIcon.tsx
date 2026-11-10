import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { SortDirectionIconProps } from "../../types/sort-direction-icon-props";

/** The arrow beside a sortable header. Decorative; the th's aria-sort carries the state. */
export default function SortDirectionIcon({ direction }: SortDirectionIconProps) {
  return (
    <span className="text-muted-foreground" aria-hidden="true">
      {direction === "asc" ? (
        <ChevronUp className="w-3.5 h-3.5" />
      ) : direction === "desc" ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
      )}
    </span>
  );
}

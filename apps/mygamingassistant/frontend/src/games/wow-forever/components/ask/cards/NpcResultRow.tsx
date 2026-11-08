import clsx from "clsx";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { poiProvenance } from "@/games/wow-forever/lib/provenance/poiProvenance";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";

interface NpcResultRowProps {
  row: AskNpcRow;
  selected: boolean;
  onToggle: (poiId: string) => void;
}

/** One numbered NPC: pick it to see it on the card's map and get "Route there". */
export default function NpcResultRow({ row, selected, onToggle }: NpcResultRowProps) {
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle(row.poiId)}
        className={clsx(
          "flex min-h-[44px] flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50",
        )}
      >
        <span
          aria-hidden
          className={clsx(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            selected ? "bg-red-600 text-white" : "bg-amber-400 text-black",
          )}
        >
          {row.n}
        </span>
        <span className="min-w-0">
          <span className="block font-medium">
            {row.name}
            {row.title ? <span className="font-normal text-muted-foreground"> &lt;{row.title}&gt;</span> : null}
          </span>
          <span className="block text-xs text-muted-foreground">
            {row.area} · {row.distance}
          </span>
        </span>
      </button>
      <ProvenanceBadge {...poiProvenance(row)} />
    </li>
  );
}

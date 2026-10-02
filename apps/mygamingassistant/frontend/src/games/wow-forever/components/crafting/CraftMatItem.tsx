import type { ReactNode } from "react";
import CraftMatSources from "@/games/wow-forever/components/crafting/CraftMatSources";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { matSummary } from "@/games/wow-forever/crafting/matSources";

interface CraftMatItemProps {
  itemId: number;
  /** "2× Linen Cloth", or the name and count laid out by the list. */
  label: ReactNode;
  place: CraftPlace;
  professionLabel: string;
  /** The one-line "easiest way" under the name — off in route rows, where it would crowd the row. */
  showSummary?: boolean;
}

function summaryOf(itemId: number, place: CraftPlace, professionLabel: string): string {
  const madeBy = place.file.madeBy[String(itemId)] ?? null;
  if (madeBy === professionLabel) return `You make this (${professionLabel})`;
  return matSummary({ sources: place.sources.reagent(itemId), madeBy }, place.faction, place.zoneId);
}

/** A material that opens to where to get it, with the easiest way underneath its name (unless turned off). */
export default function CraftMatItem({ itemId, label, place, professionLabel, showSummary = true }: CraftMatItemProps) {
  return (
    <li>
      <details className="group" data-mat={itemId}>
        <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">
          {label}
          {showSummary ? <span className="block text-xs text-muted-foreground">{summaryOf(itemId, place, professionLabel)}</span> : null}
        </summary>
        <div className="pt-2 pb-3 pl-4">
          <CraftMatSources itemId={itemId} place={place} professionLabel={professionLabel} />
        </div>
      </details>
    </li>
  );
}

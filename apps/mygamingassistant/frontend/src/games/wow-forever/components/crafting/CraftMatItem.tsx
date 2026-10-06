import type { ReactNode } from "react";
import CraftMatSources from "@/games/wow-forever/components/crafting/CraftMatSources";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { SUMMARY_PARTS, matSummary } from "@/games/wow-forever/crafting/matSources";

interface CraftMatItemProps {
  itemId: number;
  /** "2× Linen Cloth", or the name and count laid out by the list. */
  label: ReactNode;
  place: CraftPlace;
  professionLabel: string;
  /** How many ways the line under the name lists — one in route rows, where space is tight. */
  summaryParts?: number;
}

function summaryOf(itemId: number, place: CraftPlace, professionLabel: string, parts: number): string {
  const madeBy = place.file.madeBy[String(itemId)] ?? null;
  if (madeBy === professionLabel) return `You make this (${professionLabel})`;
  return matSummary({ sources: place.sources.reagent(itemId), madeBy }, place, parts);
}

/** A material with the easiest way to get it underneath its name; opens to every source. */
export default function CraftMatItem({ itemId, label, place, professionLabel, summaryParts = SUMMARY_PARTS }: CraftMatItemProps) {
  return (
    <li>
      <details className="group" data-mat={itemId}>
        <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">
          {label}
          <span className="block text-xs text-muted-foreground">{summaryOf(itemId, place, professionLabel, summaryParts)}</span>
        </summary>
        <div className="pt-2 pb-3 pl-4">
          <CraftMatSources itemId={itemId} place={place} professionLabel={professionLabel} />
        </div>
      </details>
    </li>
  );
}

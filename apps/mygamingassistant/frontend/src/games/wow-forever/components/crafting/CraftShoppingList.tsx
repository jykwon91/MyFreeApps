import { useState } from "react";
import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import CraftMakeLines from "@/games/wow-forever/components/crafting/CraftMakeLines";
import CraftShoppingLines from "@/games/wow-forever/components/crafting/CraftShoppingLines";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { matSummary, soldToYou } from "@/games/wow-forever/crafting/matSources";
import { shoppingList, shoppingListText } from "@/games/wow-forever/crafting/shoppingList";
import type { ResolvedRouteEntry, ShoppingLine } from "@/games/wow-forever/types/crafting";

const SCOPE = { mine: "mine", all: "all" } as const;
type Scope = (typeof SCOPE)[keyof typeof SCOPE];

const SUMMARY_ITEMS = 3;

interface CraftShoppingListProps {
  entries: readonly ResolvedRouteEntry[];
  skill: number | null;
  place: CraftPlace;
  professionLabel: string;
  note?: string;
  /** Your prices, once any are entered — each line then shows what it costs. */
  priceBook?: PriceBook | null;
}

/** Everything the route still needs, as one list to shop or farm from — collapsed under its top items. */
export default function CraftShoppingList({ entries, skill, place, professionLabel, note, priceBook }: CraftShoppingListProps) {
  const [scope, setScope] = useState<Scope>(SCOPE.mine);
  const fromSkill = scope === SCOPE.mine ? skill : null;
  const list = shoppingList(entries, fromSkill, place.file, professionLabel);
  // A vendor near you beats the auction house, even for what a profession can make (Copper Rod).
  const bought = (l: ShoppingLine) => !l.madeBy || soldToYou(place.sources.reagent(l.id), place.faction);
  const summary = (l: ShoppingLine) =>
    matSummary({ sources: place.sources.reagent(l.id), madeBy: l.madeBy ?? null }, place.faction, place.zoneId);
  const end = entries.reduce((max, e) => Math.max(max, e.kind === "craft" ? e.step.to : 0), 0);
  const top = list.buy.slice(0, SUMMARY_ITEMS).map((l) => `${l.count} ${l.name}`).join(", ");
  const past = fromSkill !== null && fromSkill >= end;
  const costOf = (l: ShoppingLine): number | undefined => {
    const unit = priceBook?.item(l.id, l.name).price;
    if (unit === undefined) return undefined;
    return unit * l.count;
  };

  return (
    <details className="rounded-xl border bg-card p-3 sm:p-4 group" id="shopping-list">
      <summary className="cursor-pointer min-h-[44px] flex flex-col justify-center">
        <span className="font-semibold">Shopping list</span>
        <span className="text-sm text-muted-foreground">{past ? "Nothing left to buy for this route." : `${top}…`}</span>
      </summary>
      <div className="space-y-4 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          {skill !== null ? (
            <SegmentedToggle
              label="Shopping list for"
              options={[
                { id: SCOPE.mine, label: `From skill ${skill}` },
                { id: SCOPE.all, label: "Whole route" },
              ]}
              value={scope}
              onChange={setScope}
            />
          ) : null}
          {past ? null : <CopyButton text={shoppingListText(list, summary)} label="Copy list" title="Copy the shopping list" />}
        </div>
        {past ? (
          <p className="text-sm">You're past the end of this route ({end}). See the last row for what to craft next.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Open an item to see where to get it. Everything here is also on the auction house.
            </p>
            <CraftShoppingLines title="Buy or farm" lines={list.buy.filter(bought)} place={place} professionLabel={professionLabel} costOf={costOf} />
            <CraftShoppingLines
              title="Made by other professions (buy at the auction house)"
              lines={list.buy.filter((l) => !bought(l))}
              place={place}
              professionLabel={professionLabel}
              costOf={costOf}
            />
            <CraftMakeLines lines={list.make} />
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Counts are averages for the route{fromSkill !== null ? ` from skill ${fromSkill}` : ""} — bring a few spare.
          {note ? ` ${note}` : ""}
        </p>
      </div>
    </details>
  );
}

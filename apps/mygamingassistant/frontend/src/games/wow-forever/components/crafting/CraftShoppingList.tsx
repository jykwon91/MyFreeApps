import { useState } from "react";
import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import CraftMakeLines from "@/games/wow-forever/components/crafting/CraftMakeLines";
import CraftShoppingLines from "@/games/wow-forever/components/crafting/CraftShoppingLines";
import { shoppingList, shoppingListText } from "@/games/wow-forever/crafting/shoppingList";
import type { CraftingFile, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

const SCOPE = { mine: "mine", all: "all" } as const;
type Scope = (typeof SCOPE)[keyof typeof SCOPE];

const SUMMARY_ITEMS = 3;

interface CraftShoppingListProps {
  entries: readonly ResolvedRouteEntry[];
  skill: number | null;
  file: Pick<CraftingFile, "madeBy" | "recipes">;
  professionLabel: string;
  note?: string;
}

/** Everything the route still needs, as one list to shop or farm from — collapsed under its top items. */
export default function CraftShoppingList({ entries, skill, file, professionLabel, note }: CraftShoppingListProps) {
  const [scope, setScope] = useState<Scope>(SCOPE.mine);
  const fromSkill = scope === SCOPE.mine ? skill : null;
  const list = shoppingList(entries, fromSkill, file, professionLabel);
  const end = entries.reduce((max, e) => Math.max(max, e.kind === "craft" ? e.step.to : 0), 0);
  const top = list.buy.slice(0, SUMMARY_ITEMS).map((l) => `${l.count} ${l.name}`).join(", ");
  const past = fromSkill !== null && fromSkill >= end;

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
          {past ? null : <CopyButton text={shoppingListText(list)} label="Copy list" title="Copy the shopping list" />}
        </div>
        {past ? (
          <p className="text-sm">You're past the end of this route ({end}). See the last row for what to craft next.</p>
        ) : (
          <>
            <CraftShoppingLines title="Buy or farm" lines={list.buy.filter((l) => !l.madeBy)} />
            <CraftShoppingLines title="Made by other professions (buy at the auction house)" lines={list.buy.filter((l) => l.madeBy)} />
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

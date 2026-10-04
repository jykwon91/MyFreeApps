import type { ComponentProps } from "react";
import { Badge } from "@platform/ui";
import type { LootCall, LootRule } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";

const CALL_LABEL: Readonly<Record<LootCall, string>> = {
  disenchant: "Disenchant",
  compare: "Check the price first",
  vendor: "Vendor it",
};

const CALL_COLOR: Readonly<Record<LootCall, ComponentProps<typeof Badge>["color"]>> = {
  disenchant: "purple",
  compare: "blue",
  vendor: "gray",
};

/** "Disenchant or sell?" — one line per kind of loot, first match wins. */
export default function DisenchantOrSell({ rules }: { rules: readonly LootRule[] }) {
  return (
    <ol className="divide-y rounded-lg border bg-card">
      {rules.map((rule) => (
        <li key={rule.id} data-rule={rule.id} className="space-y-1 p-3 sm:grid sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4 sm:space-y-0">
          <div className="space-y-1">
            <p className="font-medium">{rule.when}</p>
            <Badge label={CALL_LABEL[rule.call]} color={CALL_COLOR[rule.call]} />
          </div>
          <p className="text-sm">{rule.why}</p>
        </li>
      ))}
    </ol>
  );
}

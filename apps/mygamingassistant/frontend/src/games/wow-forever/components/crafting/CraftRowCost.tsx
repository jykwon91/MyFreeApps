import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { ResolvedCraftStep } from "@/games/wow-forever/types/crafting";

/** Names after this many read as "and 2 more" — the row's materials list has the rest. */
const MISSING_NAMES = 2;

function missingText(missing: readonly { name: string }[]): string {
  const names = missing.slice(0, MISSING_NAMES).map((m) => m.name);
  const extra = missing.length - names.length;
  if (extra > 0) return `${names.join(", ")} and ${extra} more`;
  return names.join(" and ");
}

/** "~2g 40s" for the row, or what it still needs a price for. Nothing before prices are in. */
export default function CraftRowCost({ entry }: { entry: Pick<ResolvedCraftStep, "source" | "cost" | "missing"> }) {
  if (!entry.source) return null;
  if (entry.cost !== undefined) {
    return (
      <p className="text-sm text-right font-medium tabular-nums">
        <span className="sr-only">Expected cost: </span>
        {formatCost(entry.cost)}
      </p>
    );
  }
  if (!entry.missing?.length) return null;
  return <p className="text-xs text-right text-muted-foreground">Cost unknown — needs a price for {missingText(entry.missing)}</p>;
}

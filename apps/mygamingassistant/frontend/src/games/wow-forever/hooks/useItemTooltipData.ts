import { useEffect, useState } from "react";
import { cachedItemTooltip, loadItemTooltip } from "@/games/wow-forever/lib/itemPages/itemTooltipLoader";
import type { ItemTooltipSettled as Settled } from "@/games/wow-forever/types/itemPages/itemTooltipSettled";
import type { ItemTooltipState } from "@/games/wow-forever/types/itemPages/itemTooltipState";

/**
 * An open tooltip's data: instant when its shard is cached, else it loads.
 * Mount it only while the tooltip is open, so each open after a failure tries again.
 */
export function useItemTooltipData(itemId: number): ItemTooltipState {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (cachedItemTooltip(itemId) !== undefined) return;
    let live = true;
    loadItemTooltip(itemId).then(
      () => live && setSettled({ itemId, failed: false }),
      () => live && setSettled({ itemId, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [itemId]);

  const cached = cachedItemTooltip(itemId);
  if (cached) return { status: "ready", data: cached };
  if (cached === null) return { status: "missing" };
  if (settled?.itemId === itemId && settled.failed) return { status: "error" };
  return { status: "loading" };
}

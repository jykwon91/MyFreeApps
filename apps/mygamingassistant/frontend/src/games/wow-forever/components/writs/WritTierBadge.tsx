import clsx from "clsx";
import { WRIT_TIER_LABEL } from "@/games/wow-forever/data/professions/writs/writTiers";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

export default function WritTierBadge({ tier, className }: { tier: WritTier; className?: string }) {
  return (
    <span
      data-testid="writ-tier"
      className={clsx("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium", className)}
    >
      {WRIT_TIER_LABEL[tier]}
    </span>
  );
}

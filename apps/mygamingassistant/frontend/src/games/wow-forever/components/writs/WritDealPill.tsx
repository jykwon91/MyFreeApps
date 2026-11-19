import { Check } from "lucide-react";
import { WRIT_DEAL_THRESHOLD_LABEL } from "@/games/wow-forever/data/professions/writs/writDealThresholds";
import { WRIT_TIER_LABEL } from "@/games/wow-forever/data/professions/writs/writTiers";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** "Deal": the writ and its item cost less than the tier's threshold together. Icon + word, never colour alone. */
export default function WritDealPill({ tier }: { tier: WritTier }) {
  return (
    <span
      data-testid="writ-deal"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
    >
      <Check className="h-3 w-3" aria-hidden />
      Deal
      <span className="sr-only">
        {" "}
        under {WRIT_DEAL_THRESHOLD_LABEL[tier]} for {WRIT_TIER_LABEL[tier]} writs
      </span>
    </span>
  );
}

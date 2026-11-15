import clsx from "clsx";
import { ArrowRight, Coins, ScrollText, Shirt, Sparkles } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { guideProfession } from "@/games/wow-forever/lib/character/characterProfessions";
import { recipeProfession } from "@/games/wow-forever/lib/recipes/recipeProfession";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { GuildMatch } from "@/games/wow-forever/types/guild/guildMatch";

interface GuildMatchCardProps {
  match: GuildMatch;
  /** Null while prices are loading; undefined when prices aren't available. */
  prices: AuctionPrices | null | undefined;
}

/** The AH cost of all reagents for one craft (copper); null if any reagent has no price. */
function totalReagentCost(match: GuildMatch, prices: AuctionPrices | null | undefined): number | null {
  if (!prices) return null;
  let total = 0;
  for (const reagent of match.proposed.reagents) {
    const price = prices.byId.get(reagent.id);
    if (!price) return null; // unknown price — can't total
    total += price.marketValue * reagent.count;
  }
  return total;
}

/**
 * One help opportunity card: who can help, who gets helped, what slot,
 * the enchant or crafted item, its reagents with per-item AH prices, and a cost estimate.
 */
export default function GuildMatchCard({ match, prices }: GuildMatchCardProps) {
  const { crafter, beneficiary, slot, worn, proposed, type, upgrade_pct } = match;

  const guide = guideProfession(crafter.profession_id);
  const prof = recipeProfession(guide);
  const cost = totalReagentCost(match, prices);

  const isGear = type === "gear";
  const upgradeLabel = upgrade_pct !== null ? `+${upgrade_pct}% score` : null;

  return (
    <li className="rounded-lg border bg-card px-3 py-2 space-y-1.5" data-testid="guild-match-card">
      {/* Header: crafter → beneficiary with type badge */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[44px]">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground shrink-0">
            {guide && <GameIcon icon={professionIcon(guide)} size={16} alt="" />}
            {crafter.profession_name} {crafter.skill}/{crafter.max_skill}
          </span>
          <GuildMemberLink member={crafter} size="sm" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <GuildMemberLink member={beneficiary} size="sm" />
          <span className="text-xs text-muted-foreground shrink-0">lv {beneficiary.level}</span>
        </span>
        {upgradeLabel && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
            {upgradeLabel}
          </span>
        )}
      </div>

      {/* Slot: worn → proposed */}
      <div className="text-sm text-muted-foreground leading-snug">
        {isGear ? (
          <Shirt className="mr-1.5 -mt-0.5 inline h-4 w-4 text-primary" aria-label="Gear upgrade" />
        ) : (
          <Sparkles className="mr-1.5 -mt-0.5 inline h-4 w-4 text-primary" aria-label="Enchant" />
        )}
        <span className="font-medium text-foreground">{slot.slot_label}</span>
        {" — "}
        <ItemNameLink itemId={worn.item_id} name={worn.name} withIcon className="line-through" />
        {worn.item_level > 0 && <span className="text-xs"> (ilvl {worn.item_level})</span>}
        {" → "}
        {proposed.item_id !== null ? (
          <ItemNameLink itemId={proposed.item_id} name={proposed.name} withIcon className="font-medium text-foreground" />
        ) : (
          <span className="font-medium text-foreground">{proposed.name}</span>
        )}
        {isGear && proposed.item_level != null && (
          <span className="text-xs"> (ilvl {proposed.item_level})</span>
        )}
      </div>

      {/* Recipe link */}
      <div className="flex items-center gap-1 text-sm">
        <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">Recipe: </span>
        <RecipeRef profession={prof} spell={proposed.spell} name={proposed.name} iconSize={16} className="inline-flex items-center gap-1" />
      </div>

      {/* Reagents */}
      {proposed.reagents.length > 0 && (
        <ul className="text-sm space-y-0.5" aria-label={`Reagents for ${proposed.name}`}>
          {proposed.reagents.map((r) => {
            const unitPrice = prices?.byId.get(r.id)?.marketValue;
            return (
              <li key={r.id} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">{r.count}×</span>
                <ItemNameLink itemId={r.id} name={r.name} withIcon />
                {unitPrice !== undefined && (
                  <span className="text-xs">{formatCost(unitPrice)} ea</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Total cost */}
      {cost !== null && (
        <div className={clsx("flex items-center gap-1 text-sm font-medium", cost === 0 ? "text-muted-foreground" : "text-foreground")}>
          <Coins className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          Est. cost:{" "}
          <span className="tabular-nums">{cost === 0 ? "free (self-farmed)" : formatCost(cost)}</span>
        </div>
      )}
    </li>
  );
}

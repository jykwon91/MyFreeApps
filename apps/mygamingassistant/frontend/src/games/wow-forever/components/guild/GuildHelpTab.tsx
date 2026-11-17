/**
 * "Help each other" tab: finds enchant and gear-upgrade opportunities between
 * guild members, computed entirely client-side from stored sheets.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import GuildHelpFilterBar from "@/games/wow-forever/components/guild/GuildHelpFilterBar";
import GuildHelpSkeleton from "@/games/wow-forever/components/guild/GuildHelpSkeleton";
import GuildMatchCard from "@/games/wow-forever/components/guild/GuildMatchCard";
import { GUILD_HELP_PROBLEM, GUILD_HELP_TEXT, NO_HELP_ITEMS } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { useGetGuildHelpQuery } from "@/games/wow-forever/api/wowGuildApi";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { useHelpCraftingFiles } from "@/games/wow-forever/hooks/useHelpCraftingFiles";
import { computeEnchantMatches } from "@/games/wow-forever/lib/guild/guildEnchantMatches";
import { computeGearMatches } from "@/games/wow-forever/lib/guild/guildGearMatches";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import { buildHelpParams, helpFiltersFromParams } from "@/games/wow-forever/lib/guild/guildHelpParams";
import type { GuildHelpFilters } from "@/games/wow-forever/types/guild/guildHelpFilters";
import type { GuildMatch } from "@/games/wow-forever/types/guild/guildMatch";

interface GuildHelpTabProps {
  slug: string;
}

/** The guild "Help each other" tab. */
export default function GuildHelpTab({ slug }: GuildHelpTabProps) {
  const [params, setParams] = useSearchParams();
  const filters = helpFiltersFromParams(params);
  const { type, mode, forSlug, bySlug } = filters;

  const update = useCallback(
    (next: GuildHelpFilters) => setParams(buildHelpParams(params, next), { replace: true }),
    [params, setParams],
  );

  const helpQuery = useGetGuildHelpQuery(slug);
  const isReady = helpQuery.isSuccess && !!helpQuery.data;

  const craftingState = useHelpCraftingFiles(isReady);
  const itemsState = useClientItems(isReady);
  const { prices } = useAuctionPrices();

  const members = useMemo(
    () => helpQuery.data?.members ?? [],
    [helpQuery.data],
  );

  // "Made by" someone: only their recipes count, so their best offer per slot shows even where a guild mate's is better.
  const crafter = bySlug === null ? null : (members.find((m) => m.slug === bySlug) ?? null);
  const crafters = useMemo(() => (crafter ? [crafter] : members), [crafter, members]);

  const allMatches = useMemo<GuildMatch[]>(() => {
    if (!isReady || craftingState.files === null) return [];

    if (itemsState.status === "loading") return [];
    const itemList = itemsState.status === "ready" ? itemsState.list : null;

    const enchantingFile = craftingState.files.get(PROFESSION_SKILL_LINES.enchanting);
    // Without the item list, weapon speeds are unknown, so flat weapon damage isn't weighed.
    const enchantMatches = enchantingFile
      ? computeEnchantMatches(members, enchantingFile, itemList?.byId ?? NO_HELP_ITEMS, crafters, mode)
      : [];
    const gearMatches = itemList ? computeGearMatches(members, craftingState.files, itemList, crafters, mode) : [];

    return [...enchantMatches, ...gearMatches];
  }, [isReady, craftingState.files, members, itemsState, crafters, mode]);

  const filtered = useMemo<GuildMatch[]>(() => {
    return allMatches.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (forSlug !== null && m.beneficiary.slug !== forSlug) return false;
      return true;
    });
  }, [allMatches, type, forSlug]);

  if (helpQuery.isError) {
    return <LoadErrorRetry message={GUILD_HELP_PROBLEM} onRetry={helpQuery.refetch} retrying={helpQuery.isFetching} />;
  }

  if (craftingState.error) {
    return <LoadErrorRetry message={GUILD_HELP_PROBLEM} onRetry={craftingState.retry} retrying={false} />;
  }

  const isLoading =
    helpQuery.isLoading ||
    craftingState.files === null ||
    (isReady && itemsState.status === "loading");

  if (isLoading) {
    return <GuildHelpSkeleton />;
  }

  const crafterName = crafter ? memberFullName(crafter) : null;
  const helped = new Set(filtered.map((m) => m.beneficiary.slug)).size;
  let emptyText: string = GUILD_HELP_TEXT.noneForFilter;
  if (allMatches.length === 0) emptyText = crafterName ? GUILD_HELP_TEXT.madeByNone(crafterName) : GUILD_HELP_TEXT.noneAtAll;

  return (
    <section className="space-y-4 rounded-xl border bg-card/50 p-3 sm:p-4" aria-label="Help each other">
      <h2 className="text-lg font-semibold">Help each other</h2>
      <GuildHelpFilterBar members={members} filters={filters} onChange={update} />
      <p className="text-sm text-muted-foreground" data-testid="help-weights-note">
        {GUILD_HELP_TEXT.weightsNote[mode]}
      </p>
      {crafterName && filtered.length > 0 && (
        <p className="text-sm font-medium" data-testid="help-made-by-summary">
          {GUILD_HELP_TEXT.madeBySummary(crafterName, helped)}
        </p>
      )}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="help-empty">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={`${filtered.length} help opportunities`} data-testid="help-match-list">
          {filtered.map((m) => (
            <GuildMatchCard
              // key: type + crafter + beneficiary + slot is unique after dedup
              key={`${m.type}-${m.crafter.slug}-${m.beneficiary.slug}-${m.slot.blizzard_slot}`}
              match={m}
              prices={prices ?? undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

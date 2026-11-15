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
import { GUILD_HELP_PROBLEM } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { useGetGuildHelpQuery } from "@/games/wow-forever/api/wowGuildApi";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { useHelpCraftingFiles } from "@/games/wow-forever/hooks/useHelpCraftingFiles";
import { computeEnchantMatches } from "@/games/wow-forever/lib/guild/guildEnchantMatches";
import { computeGearMatches } from "@/games/wow-forever/lib/guild/guildGearMatches";
import {
  buildHelpParams,
  helpForParam,
  helpTypeParam,
} from "@/games/wow-forever/lib/guild/guildHelpParams";
import type { GuildMatch, GuildMatchType } from "@/games/wow-forever/types/guild/guildMatch";

interface GuildHelpTabProps {
  slug: string;
}

/** The guild "Help each other" tab. */
export default function GuildHelpTab({ slug }: GuildHelpTabProps) {
  const [params, setParams] = useSearchParams();
  const type = helpTypeParam(params);
  const forSlug = helpForParam(params);

  const setType = useCallback(
    (next: GuildMatchType | "all") => setParams(buildHelpParams(params, next, forSlug), { replace: true }),
    [params, setParams, forSlug],
  );
  const setFor = useCallback(
    (next: string | null) => setParams(buildHelpParams(params, type, next), { replace: true }),
    [params, setParams, type],
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

  const allMatches = useMemo<GuildMatch[]>(() => {
    if (!isReady || craftingState.files === null) return [];

    const enchantingFile = craftingState.files.get(PROFESSION_SKILL_LINES.enchanting);
    const enchantMatches = enchantingFile
      ? computeEnchantMatches(members, enchantingFile)
      : [];

    const gearMatches =
      itemsState.status === "ready"
        ? computeGearMatches(members, craftingState.files, itemsState.list)
        : [];

    return [...enchantMatches, ...gearMatches];
  }, [isReady, craftingState.files, members, itemsState]);

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

  return (
    <section className="space-y-4 rounded-xl border bg-card/50 p-3 sm:p-4" aria-label="Help each other">
      <h2 className="text-lg font-semibold">Help each other</h2>
      <GuildHelpFilterBar
        members={members}
        type={type}
        forSlug={forSlug}
        onType={setType}
        onFor={setFor}
      />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="help-empty">
          {allMatches.length === 0
            ? "No opportunities found — everyone is fully enchanted and well-geared!"
            : "No matches for the current filter."}
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

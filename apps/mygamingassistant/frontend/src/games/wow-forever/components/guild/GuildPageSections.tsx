import { useMemo } from "react";
import GuildHeroes from "@/games/wow-forever/components/guild/GuildHeroes";
import GuildHotRaces from "@/games/wow-forever/components/guild/GuildHotRaces";
import GuildLeaderboards from "@/games/wow-forever/components/guild/GuildLeaderboards";
import GuildQuests from "@/games/wow-forever/components/guild/GuildQuests";
import GuildRecipeSearch from "@/games/wow-forever/components/guild/GuildRecipeSearch";
import GuildRollCall from "@/games/wow-forever/components/guild/GuildRollCall";
import GuildTitlesStrip from "@/games/wow-forever/components/guild/GuildTitlesStrip";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { awardGuildTitles } from "@/games/wow-forever/lib/guild/guildTitles";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildPageSectionsProps {
  guild: GuildResponse;
}

/**
 * A guild with members, the fun parts first: this week's heroes, the viewer's quests, hot races, the Hall of Titles
 * and the Arena; then the recipe search and the roll call (member list, titles by each name).
 */
export default function GuildPageSections({ guild }: GuildPageSectionsProps) {
  const titles = useMemo(() => awardGuildTitles(guild.members), [guild.members]);
  const { me } = useLeaderboardParams();
  return (
    <>
      <GuildHeroes members={guild.members} gainsWindowDays={guild.gains_window_days} />
      <GuildQuests members={guild.members} titles={titles} me={me} />
      <GuildHotRaces members={guild.members} titles={titles} />
      <GuildTitlesStrip titles={titles} />
      <GuildLeaderboards slug={guild.slug} members={guild.members} gainsWindowDays={guild.gains_window_days} />
      <GuildRecipeSearch slug={guild.slug} />
      <GuildRollCall members={guild.members} rosterUpdatedAt={guild.roster_updated_at} titles={titles.bySlug} />
    </>
  );
}

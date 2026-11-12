import { useMemo } from "react";
import GuildLeaderboards from "@/games/wow-forever/components/guild/GuildLeaderboards";
import GuildMembersSection from "@/games/wow-forever/components/guild/GuildMembersSection";
import GuildRecipeSearch from "@/games/wow-forever/components/guild/GuildRecipeSearch";
import GuildTitlesStrip from "@/games/wow-forever/components/guild/GuildTitlesStrip";
import { awardGuildTitles } from "@/games/wow-forever/lib/guild/guildTitles";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildPageSectionsProps {
  guild: GuildResponse;
}

/** A guild with members: recipe search, titles, leaderboards, and the member list (titles by each name). */
export default function GuildPageSections({ guild }: GuildPageSectionsProps) {
  const titles = useMemo(() => awardGuildTitles(guild.members), [guild.members]);
  return (
    <>
      <GuildRecipeSearch slug={guild.slug} />
      <GuildTitlesStrip titles={titles} />
      <GuildLeaderboards slug={guild.slug} members={guild.members} gainsWindowDays={guild.gains_window_days} />
      <GuildMembersSection members={guild.members} rosterUpdatedAt={guild.roster_updated_at} titles={titles.bySlug} />
    </>
  );
}

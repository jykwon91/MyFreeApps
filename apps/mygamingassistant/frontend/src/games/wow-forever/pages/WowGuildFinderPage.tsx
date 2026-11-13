import { Navigate, useSearchParams } from "react-router-dom";
import GuildFinderSearch from "@/games/wow-forever/components/guild/finder/GuildFinderSearch";
import GuildFinderYourGuild from "@/games/wow-forever/components/guild/finder/GuildFinderYourGuild";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GUILD_PAGE_PATH } from "@/games/wow-forever/data/guild/guildConfig";
import { GUILD_FINDER_COPY, GUILD_FINDER_PARAMS } from "@/games/wow-forever/data/guild/guildFinderConfig";
import { WOW_HUB_PATH } from "@/games/wow-forever/data/wowPagePaths";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRememberedGuild } from "@/games/wow-forever/hooks/useRememberedGuild";

/**
 * /wow-forever/guild — the Guild menu item. Opens the guild of the last character you looked up;
 * with none (or `?find=1` / a search in `?q=`) it's a search over the guilds we have.
 */
export default function WowGuildFinderPage() {
  useDocumentTitle("Guild · WoW Forever");
  const [params] = useSearchParams();
  const { guild } = useRememberedGuild();
  const searching = params.has(GUILD_FINDER_PARAMS.find) || params.has(GUILD_FINDER_PARAMS.query);

  if (guild && !searching) return <Navigate to={`${GUILD_PAGE_PATH}/${guild.slug}`} replace />;

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title={GUILD_FINDER_COPY.title}
        subtitle={GUILD_FINDER_COPY.subtitle}
        backTo={WOW_HUB_PATH}
        backLabel="Back to WoW Forever"
      />
      {guild ? <GuildFinderYourGuild guild={guild} /> : null}
      <GuildFinderSearch heading={guild ? GUILD_FINDER_COPY.findAnother : GUILD_FINDER_COPY.find} />
    </main>
  );
}

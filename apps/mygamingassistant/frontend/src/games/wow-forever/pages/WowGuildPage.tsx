import { useGetGuildQuery } from "@/games/wow-forever/api/wowGuildApi";
import GuildPageBody from "@/games/wow-forever/components/guild/GuildPageBody";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GUILD_SLUG } from "@/games/wow-forever/data/guild/guildConfig";
import { WOW_HUB_PATH } from "@/games/wow-forever/data/wowPagePaths";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/** /wow-forever/guild — topdeadcenter's stored members: find one and open their character. */
export default function WowGuildPage() {
  const { data: guild, error, isFetching, refetch } = useGetGuildQuery(GUILD_SLUG);
  useDocumentTitle(`${guild ? `<${guild.name}>` : "Guild"} · WoW Forever`);

  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title={guild ? `<${guild.name}>` : "Guild"}
        subtitle="Everyone in the guild we have from Blizzard — find a member and open their character."
        backTo={WOW_HUB_PATH}
        backLabel="Back to WoW Forever"
      />
      <GuildPageBody guild={guild} error={error} isFetching={isFetching} onRetry={refetch} />
    </div>
  );
}

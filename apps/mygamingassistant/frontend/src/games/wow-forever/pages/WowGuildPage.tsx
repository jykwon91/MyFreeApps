import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useGetGuildQuery } from "@/games/wow-forever/api/wowGuildApi";
import GuildPageBody from "@/games/wow-forever/components/guild/GuildPageBody";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GUILD_NOT_FOUND_STATUS, GUILD_PAGE_PATH } from "@/games/wow-forever/data/guild/guildConfig";
import { GUILD_FINDER_COPY, GUILD_FINDER_FIND_VALUE, GUILD_FINDER_PARAMS } from "@/games/wow-forever/data/guild/guildFinderConfig";
import { WOW_HUB_PATH } from "@/games/wow-forever/data/wowPagePaths";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRememberedGuild } from "@/games/wow-forever/hooks/useRememberedGuild";
import { statusOf } from "@/games/wow-forever/lib/raidPageError";

/** /wow-forever/guild/:slug — a guild's stored members: find one and open their character. */
export default function WowGuildPage() {
  const { slug: rawSlug = "" } = useParams<{ slug: string }>();
  const slug = rawSlug.toLowerCase();
  const { data, error, isFetching, refetch } = useGetGuildQuery(slug, { skip: !slug });
  const guild = data && data.slug === slug ? data : undefined;
  useDocumentTitle(`${guild ? `<${guild.name}>` : "Guild"} · WoW Forever`);
  const { guild: remembered, forget } = useRememberedGuild();
  const notFound = error !== undefined && statusOf(error) === GUILD_NOT_FOUND_STATUS;

  // A remembered guild we no longer have would make the Guild menu item open a dead end.
  useEffect(() => {
    if (notFound && remembered?.slug === slug) forget();
  }, [notFound, remembered, slug, forget]);

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title={guild ? `<${guild.name}>` : "Guild"}
        subtitle="Everyone in the guild we have from Blizzard — find a member and open their character."
        backTo={WOW_HUB_PATH}
        backLabel="Back to WoW Forever"
      />
      <Link
        to={`${GUILD_PAGE_PATH}?${GUILD_FINDER_PARAMS.find}=${GUILD_FINDER_FIND_VALUE}`}
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        {GUILD_FINDER_COPY.findAnother}
      </Link>
      <GuildPageBody guild={guild} error={error} isFetching={isFetching} onRetry={refetch} />
    </main>
  );
}

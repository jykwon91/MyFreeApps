import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import GuildFinderIntro from "@/games/wow-forever/components/guild/finder/GuildFinderIntro";
import GuildSummaryRow from "@/games/wow-forever/components/guild/finder/GuildSummaryRow";
import { useSearchGuildsQuery } from "@/games/wow-forever/api/wowGuildApi";
import { GUILD_FINDER_COPY, GUILD_FINDER_SKELETON_ROWS } from "@/games/wow-forever/data/guild/guildFinderConfig";
import { guildSearchStatus } from "@/games/wow-forever/lib/guild/guildFinder";

/** The stored guilds matching the search, each a link to its page. */
export default function GuildFinderResults({ query }: { query: string }) {
  const { currentData, isFetching, isError, refetch } = useSearchGuildsQuery(query);

  if (isFetching && !currentData) {
    return (
      <div aria-hidden data-testid="guild-finder-skeleton">
        <CharacterRowSkeletons count={GUILD_FINDER_SKELETON_ROWS} height="h-[56px]" />
      </div>
    );
  }
  if (isError || !currentData) {
    return <LoadErrorRetry message={GUILD_FINDER_COPY.problem} onRetry={refetch} retrying={isFetching} />;
  }
  return (
    <div className="space-y-2">
      <p role="status" className="text-sm text-muted-foreground">
        {guildSearchStatus(currentData)}
      </p>
      {currentData.guilds.length === 0 ? (
        <GuildFinderIntro />
      ) : (
        <ul className="space-y-2" aria-label={GUILD_FINDER_COPY.results}>
          {currentData.guilds.map((guild) => (
            <li key={guild.slug}>
              <GuildSummaryRow slug={guild.slug} name={guild.name} faction={guild.faction} memberCount={guild.member_count} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

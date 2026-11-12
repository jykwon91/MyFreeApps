import { Button } from "@platform/ui";
import GuildLeaderboards from "@/games/wow-forever/components/guild/GuildLeaderboards";
import GuildMembersSection from "@/games/wow-forever/components/guild/GuildMembersSection";
import GuildPageSkeleton from "@/games/wow-forever/components/guild/GuildPageSkeleton";
import GuildRecipeSearch from "@/games/wow-forever/components/guild/GuildRecipeSearch";
import GuildRefreshNotice from "@/games/wow-forever/components/guild/GuildRefreshNotice";
import GuildStateNotice from "@/games/wow-forever/components/guild/GuildStateNotice";
import GuildSummary from "@/games/wow-forever/components/guild/GuildSummary";
import { GUILD_LOAD_PROBLEM, GUILD_NOT_FOUND_STATUS, GUILD_PAGE_STATES } from "@/games/wow-forever/data/guild/guildConfig";
import { statusOf } from "@/games/wow-forever/lib/raidPageError";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildPageBodyProps {
  guild: GuildResponse | undefined;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

/** The guild page below its header: the members, or the state that stands in for them. */
export default function GuildPageBody({ guild, error, isFetching, onRetry }: GuildPageBodyProps) {
  if (!guild) {
    if (isFetching) return <GuildPageSkeleton />;
    if (error && statusOf(error) !== GUILD_NOT_FOUND_STATUS) {
      return (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 space-y-3 text-sm">
          <p>{GUILD_LOAD_PROBLEM}</p>
          <Button variant="secondary" size="sm" onClick={onRetry} className="min-h-[44px]">
            Try again
          </Button>
        </div>
      );
    }
    return <GuildStateNotice state={GUILD_PAGE_STATES.notStored} onRetry={onRetry} retrying={isFetching} />;
  }
  if (guild.gone) return <GuildStateNotice state={GUILD_PAGE_STATES.gone} onRetry={onRetry} retrying={isFetching} />;
  return (
    <>
      <GuildSummary guild={guild} />
      {guild.refresh_failed ? <GuildRefreshNotice rosterUpdatedAt={guild.roster_updated_at} /> : null}
      {guild.roster_updated_at === null ? (
        <GuildStateNotice state={GUILD_PAGE_STATES.collecting} onRetry={onRetry} retrying={isFetching} />
      ) : null}
      {guild.members.length > 0 ? (
        <>
          <GuildRecipeSearch slug={guild.slug} />
          <GuildLeaderboards members={guild.members} gainsWindowDays={guild.gains_window_days} />
          <GuildMembersSection members={guild.members} rosterUpdatedAt={guild.roster_updated_at} />
        </>
      ) : null}
    </>
  );
}

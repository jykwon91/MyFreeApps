import GuildRefreshButton from "@/games/wow-forever/components/guild/GuildRefreshButton";
import { GUILD_BANNER_COPY } from "@/games/wow-forever/data/guild/guildBannerConfig";
import { GUILD_ROSTER_FRESH_HOURS } from "@/games/wow-forever/data/guild/guildConfig";
import { hoursSince } from "@/games/wow-forever/lib/guild/guildMembers";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

interface GuildBannerFooterProps {
  guild: GuildResponse;
  refetch: () => unknown;
}

/** The strip under the banner on the page's own colours: how fresh the roster is, "Refresh now", and what's missing. */
export default function GuildBannerFooter({ guild, refetch }: GuildBannerFooterProps) {
  const missing = guild.roster_size === null ? 0 : Math.max(guild.roster_size - guild.members.length, 0);
  const updatedAt = guild.roster_updated_at;
  const stale = updatedAt !== null && hoursSince(updatedAt) > GUILD_ROSTER_FRESH_HOURS;
  if (!updatedAt && !guild.can_refresh && missing === 0) return null;
  return (
    <div className="space-y-1 border-t bg-card px-3 py-2 text-card-foreground sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {updatedAt ? (
          <span className="text-muted-foreground">
            {GUILD_BANNER_COPY.rosterUpdated(stale)}{" "}
            <time dateTime={updatedAt} title={new Date(updatedAt).toLocaleString()}>
              {relativeTime(updatedAt)}
            </time>
          </span>
        ) : null}
        {guild.can_refresh ? <GuildRefreshButton guild={guild} refetch={refetch} /> : null}
      </div>
      {missing > 0 ? (
        <p className="text-xs text-muted-foreground">{GUILD_BANNER_COPY.missing(missing)}</p>
      ) : null}
      {stale ? (
        <p className="text-xs text-muted-foreground">{GUILD_BANNER_COPY.stale}</p>
      ) : null}
    </div>
  );
}

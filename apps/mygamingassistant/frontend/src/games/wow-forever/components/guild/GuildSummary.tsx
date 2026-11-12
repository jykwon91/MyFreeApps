import { FACTION_LABELS } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_ROSTER_FRESH_HOURS } from "@/games/wow-forever/data/guild/guildConfig";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { hoursSince } from "@/games/wow-forever/lib/guild/guildMembers";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

/** Faction, how many members show out of the roster, and how fresh the roster is. */
export default function GuildSummary({ guild }: { guild: GuildResponse }) {
  const shown = guild.members.length;
  const missing = guild.roster_size === null ? 0 : Math.max(guild.roster_size - shown, 0);
  const updatedAt = guild.roster_updated_at;
  const stale = updatedAt !== null && hoursSince(updatedAt) > GUILD_ROSTER_FRESH_HOURS;
  return (
    <section className="space-y-2" aria-label="Guild">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={BADGE}>{FACTION_LABELS[guild.faction] ?? guild.faction}</span>
        {guild.roster_size === null ? null : (
          <span>
            {shown} of {guild.roster_size} members shown
          </span>
        )}
        {updatedAt ? (
          <span className="text-muted-foreground">
            · Roster {stale ? "last " : ""}updated{" "}
            <time dateTime={updatedAt} title={new Date(updatedAt).toLocaleString()}>
              {relativeTime(updatedAt)}
            </time>
          </span>
        ) : null}
      </div>
      {missing > 0 ? (
        <p className="text-xs text-muted-foreground">
          {missing} {missing === 1 ? "member has" : "members have"} no profile from Blizzard, so they&apos;re not listed.
        </p>
      ) : null}
      {stale ? (
        <p className="text-xs text-muted-foreground">
          The roster refreshes every hour while someone keeps looking up its members. Look one up on Your
          character to start it again.
        </p>
      ) : null}
    </section>
  );
}

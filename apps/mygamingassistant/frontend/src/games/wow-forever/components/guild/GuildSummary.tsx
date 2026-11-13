import clsx from "clsx";
import GuildBannerChips from "@/games/wow-forever/components/guild/GuildBannerChips";
import GuildBannerFooter from "@/games/wow-forever/components/guild/GuildBannerFooter";
import GuildBannerMaster from "@/games/wow-forever/components/guild/GuildBannerMaster";
import { FACTION_LABELS } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_BANNER_COPY, GUILD_BANNER_FALLBACK, GUILD_BANNER_STYLES } from "@/games/wow-forever/data/guild/guildBannerConfig";
import { guildTotals } from "@/games/wow-forever/lib/guild/guildTotals";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

/** The guild's heraldic banner: faction colours and emblem, its name big, the guild master, and the guild's totals; the roster's freshness and "Refresh now" underneath. */
export default function GuildSummary({ guild, refetch }: { guild: GuildResponse; refetch: () => unknown }) {
  const style = GUILD_BANNER_STYLES[guild.faction] ?? GUILD_BANNER_FALLBACK;
  const Emblem = style.emblem;
  const master = guild.members.find((m) => m.rank === 0);
  return (
    <section aria-label={GUILD_BANNER_COPY.sectionLabel} className="overflow-hidden rounded-2xl border shadow-md">
      <div className={clsx("relative bg-gradient-to-br p-4 text-white sm:p-6", style.gradient)}>
        <Emblem aria-hidden className="pointer-events-none absolute -right-3 -top-3 h-32 w-32 rotate-12 text-white/10 sm:h-44 sm:w-44" />
        <div className="relative space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold ring-1 ring-white/25">
              {FACTION_LABELS[guild.faction] ?? guild.faction}
            </span>
            {guild.roster_size === null ? null : (
              <span>
                {guild.members.length} of {guild.roster_size} members shown
              </span>
            )}
          </p>
          <p aria-hidden className="break-words text-3xl font-extrabold tracking-tight drop-shadow sm:text-5xl">{`<${guild.name}>`}</p>
          {master ? <GuildBannerMaster master={master} /> : null}
          <GuildBannerChips totals={guildTotals(guild.members)} />
        </div>
      </div>
      <GuildBannerFooter guild={guild} refetch={refetch} />
    </section>
  );
}

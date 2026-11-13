import { useId } from "react";
import GuildSummaryRow from "@/games/wow-forever/components/guild/finder/GuildSummaryRow";
import { GUILD_FINDER_COPY } from "@/games/wow-forever/data/guild/guildFinderConfig";
import type { RememberedGuild } from "@/games/wow-forever/types/guild/rememberedGuild";

/** The remembered guild, one tap away above the search. */
export default function GuildFinderYourGuild({ guild }: { guild: RememberedGuild }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {GUILD_FINDER_COPY.yourGuild}
      </h2>
      <GuildSummaryRow slug={guild.slug} name={guild.name} faction={guild.faction} memberCount={null} />
      <p className="text-xs text-muted-foreground">{GUILD_FINDER_COPY.yourGuildNote}</p>
    </section>
  );
}

import { Mountain, Swords, Trophy } from "lucide-react";
import { GUILD_BANNER_COPY } from "@/games/wow-forever/data/guild/guildBannerConfig";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { GuildTotals } from "@/games/wow-forever/types/guild/guildTotals";

interface GuildBannerChipsProps {
  totals: GuildTotals;
}

/** The banner's three brag chips: the guild's honorable kills and dungeon clears added up, and how many are at the level cap. */
export default function GuildBannerChips({ totals }: GuildBannerChipsProps) {
  const chips = [
    { id: "hks", Icon: Swords, text: `${formatWhole(totals.honorableKills)} ${GUILD_BANNER_COPY.honorableKills}` },
    { id: "dungeons", Icon: Mountain, text: `${formatWhole(totals.dungeonClears)} ${GUILD_BANNER_COPY.dungeonClears}` },
    { id: "cap", Icon: Trophy, text: GUILD_BANNER_COPY.atCap(totals.atCap, totals.members) },
  ];
  return (
    <ul aria-label={GUILD_BANNER_COPY.totalsLabel} className="flex flex-wrap gap-2">
      {chips.map(({ id, Icon, text }) => (
        <li key={id} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/25">
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {text}
        </li>
      ))}
    </ul>
  );
}

import { Flag, Shield } from "lucide-react";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import type { GuildBannerStyle } from "@/games/wow-forever/types/guild/guildBannerStyle";

/** The banner is a dark, saturated field in both themes (white text on it is 4.5:1 or better). */
export const GUILD_BANNER_STYLES: Readonly<Record<string, GuildBannerStyle>> = {
  alliance: { gradient: "from-[#0b2a6b] via-[#1d4ed8] to-[#0b1d4d]", emblem: Shield },
  horde: { gradient: "from-[#5c0a0a] via-[#b91c1c] to-[#2b0505]", emblem: Flag },
};
export const GUILD_BANNER_FALLBACK: GuildBannerStyle = { gradient: "from-slate-800 via-slate-700 to-slate-900", emblem: Shield };

export const GUILD_BANNER_COPY = {
  sectionLabel: "Guild",
  totalsLabel: "Guild totals",
  master: "Guild master",
  honorableKills: "honorable kills",
  dungeonClears: "dungeon clears",
  atCap: (atCap: number, members: number) => `${atCap} of ${members} at level ${MAX_LEVEL}`,
  rosterUpdated: (stale: boolean) => `Roster ${stale ? "last " : ""}updated`,
  missing: (count: number) =>
    `${count} ${count === 1 ? "member has" : "members have"} no profile from Blizzard, so they're not listed.`,
  stale:
    "The roster refreshes every hour while someone keeps looking up its members. Look one up on Your character to start it again.",
} as const;

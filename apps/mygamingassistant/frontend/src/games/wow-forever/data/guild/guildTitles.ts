import {
  ChefHat, Crosshair, DoorOpen, Fish, Flame, FlaskConical, Footprints, Gem, Ghost, Hammer, Heart, HeartPulse, Leaf,
  Mountain, Backpack, PawPrint, Pickaxe, Scissors, Shield, Skull, Sparkles, Swords, Target, TrendingUp, Wrench, Zap,
} from "lucide-react";
import { LEADERBOARD_SOURCE_KIND } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { GuildTitleDef } from "@/games/wow-forever/types/guild/guildTitleDef";
import type { LeaderboardSource } from "@/games/wow-forever/types/guild/leaderboardSource";

/**
 * The title each board's leader holds, by board id. None for the faction board
 * (its standings are a separate fetch). None reuse a real in-game title or rank.
 */
export const GUILD_TITLES: Readonly<Record<string, GuildTitleDef>> = {
  level: { title: "Trailblazer", icon: Footprints, earnedFor: "highest level" },
  "item-level": { title: "Hoardmaster", icon: Gem, earnedFor: "best item level at 60" },
  dungeons: { title: "Dungeon Delver", icon: Mountain, earnedFor: "most dungeons cleared" },
  "fewest-deaths": { title: "Deathless", icon: Shield, earnedFor: "fewest deaths at 60" },
  "honorable-kills": { title: "Bloodletter", icon: Swords, earnedFor: "most honorable kills" },
  "killing-blows": { title: "Deathblow", icon: Crosshair, earnedFor: "most killing blows" },
  "deaths-to-players": { title: "Gank Magnet", icon: Ghost, earnedFor: "most deaths to players" },
  "total-kills": { title: "Reaper", icon: Skull, earnedFor: "most total kills" },
  exalted: { title: "Silver Tongue", icon: Heart, earnedFor: "most exalted reputations" },
  "levels-gained": { title: "Fast Climber", icon: TrendingUp, earnedFor: "most levels gained" },
  "dungeons-gained": { title: "Dungeon Dasher", icon: DoorOpen, earnedFor: "most new dungeon clears" },
  "honorable-kills-gained": { title: "Bloodthirsty", icon: Flame, earnedFor: "most honorable kills gained" },
  "killing-blows-gained": { title: "Sharpshooter", icon: Target, earnedFor: "most killing blows gained" },
  "total-kills-gained": { title: "Rampage", icon: Zap, earnedFor: "most total kills gained" },
  "prof-alchemy": { title: "Mad Alchemist", icon: FlaskConical, earnedFor: "top Alchemy" },
  "prof-blacksmithing": { title: "Forgemaster", icon: Hammer, earnedFor: "top Blacksmithing" },
  "prof-enchanting": { title: "Runeweaver", icon: Sparkles, earnedFor: "top Enchanting" },
  "prof-engineering": { title: "Gadgeteer", icon: Wrench, earnedFor: "top Engineering" },
  "prof-leatherworking": { title: "Hidewright", icon: Backpack, earnedFor: "top Leatherworking" },
  "prof-tailoring": { title: "Threadmaster", icon: Scissors, earnedFor: "top Tailoring" },
  "prof-herbalism": { title: "Greenthumb", icon: Leaf, earnedFor: "top Herbalism" },
  "prof-mining": { title: "Deepdelver", icon: Pickaxe, earnedFor: "top Mining" },
  "prof-skinning": { title: "Pelt Taker", icon: PawPrint, earnedFor: "top Skinning" },
  "prof-cooking": { title: "Hearthcook", icon: ChefHat, earnedFor: "top Cooking" },
  "prof-firstaid": { title: "Field Medic", icon: HeartPulse, earnedFor: "top First Aid" },
  "prof-fishing": { title: "Lake Lurker", icon: Fish, earnedFor: "top Fishing" },
};

/** A board hands out its title once this many members are on it. */
export const GUILD_TITLE_MIN_RANKED = 3;
/** A profession title needs at least this skill (anyone can have 1 Cooking). */
export const GUILD_TITLE_PROFESSION_FLOOR = 75;
/** More leaders tied than this share of the board (and at least the minimum) means nobody gets it: "everyone's 60" isn't a title. */
export const GUILD_TITLE_TIE_SHARE = 0.25;
export const GUILD_TITLE_TIE_MIN = 3;
/** A member's list shows their first title; the rest are behind "+N". */
export const GUILD_TITLE_SHOWN = 1;
/** Rows in the page skeleton's titles strip. */
export const GUILD_TITLE_SKELETON_ROWS = 3;

/** Which titles come first on a member: all-time stats, then professions, then this week's. */
export const GUILD_TITLE_SOURCE_ORDER: Readonly<Record<LeaderboardSource["kind"], number>> = {
  [LEADERBOARD_SOURCE_KIND.stat]: 0,
  [LEADERBOARD_SOURCE_KIND.faction]: 0,
  [LEADERBOARD_SOURCE_KIND.profession]: 1,
  [LEADERBOARD_SOURCE_KIND.gain]: 2,
};

export const GUILD_TITLE_COPY = {
  heading: "Guild titles",
  note: "Given by this site to each board's leader, from the guild's stats. Not in-game titles.",
  empty: `Titles show up once at least ${GUILD_TITLE_MIN_RANKED} members are on a leaderboard.`,
  weekly: "This week",
  showMore: (count: number) => `Show ${count} more guild ${count === 1 ? "title" : "titles"}`,
  showFewer: "Show fewer guild titles",
  skipped: (title: string, earnedFor: string) => `${title} (${earnedFor}): not given, too many members are tied.`,
} as const;

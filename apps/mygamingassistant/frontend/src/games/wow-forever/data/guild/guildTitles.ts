import {
  ChefHat, Crosshair, DoorOpen, Fish, Flame, FlaskConical, Footprints, Gem, Ghost, Hammer, Heart, HeartPulse, Leaf,
  Mountain, Backpack, PawPrint, Pickaxe, Scissors, Shield, Skull, Sparkles, Swords, Target, TrendingUp, Wrench, Zap,
} from "lucide-react";
import { GUILD_TITLE_TIERS as T } from "@/games/wow-forever/data/guild/titleTiers";
import { LEADERBOARD_SOURCE_KIND } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { GuildTitleDef } from "@/games/wow-forever/types/guild/guildTitleDef";
import type { LeaderboardSource } from "@/games/wow-forever/types/guild/leaderboardSource";

/**
 * The title each board's leader holds, by board id. None for the faction board
 * (its standings are a separate fetch). None reuse a real in-game title or rank.
 */
export const GUILD_TITLES: Readonly<Record<string, GuildTitleDef>> = {
  level: { title: "Trailblazer", icon: Footprints, earnedFor: "highest level", tier: T.epic,
    flavor: "Has seen more of Azeroth than the flight masters." },
  "item-level": { title: "Hoardmaster", icon: Gem, earnedFor: "best item level at 60", tier: T.legendary,
    flavor: "Dressed for the raid, even at the inn." },
  dungeons: { title: "Dungeon Delver", icon: Mountain, earnedFor: "most dungeons cleared", tier: T.epic,
    flavor: "Knows the Deadmines like the back of a gnome's hand." },
  "fewest-deaths": { title: "Deathless", icon: Shield, earnedFor: "fewest deaths at 60", tier: T.legendary,
    flavor: "Has never met the Spirit Healer." },
  "honorable-kills": { title: "Bloodletter", icon: Swords, earnedFor: "most honorable kills", tier: T.legendary,
    flavor: "The battlemasters know this name by heart." },
  "killing-blows": { title: "Deathblow", icon: Crosshair, earnedFor: "most killing blows", tier: T.epic,
    flavor: "Never leaves a kill to the healers." },
  "deaths-to-players": { title: "Gank Magnet", icon: Ghost, earnedFor: "most deaths to players", tier: T.poor,
    flavor: "Corpse run veteran. The Spirit Healer knows your name." },
  "total-kills": { title: "Reaper", icon: Skull, earnedFor: "most total kills", tier: T.epic,
    flavor: "Wolves, boars, murlocs: nothing is safe." },
  exalted: { title: "Silver Tongue", icon: Heart, earnedFor: "most exalted reputations", tier: T.epic,
    flavor: "Reputation grinds don't scare them. Tabards do." },
  "levels-gained": { title: "Fast Climber", icon: TrendingUp, earnedFor: "most levels gained", tier: T.rare,
    flavor: "Levelling so fast the flight path can't keep up." },
  "dungeons-gained": { title: "Dungeon Dasher", icon: DoorOpen, earnedFor: "most new dungeon clears", tier: T.rare,
    flavor: "Stop for loot? Not on this run." },
  "honorable-kills-gained": { title: "Bloodthirsty", icon: Flame, earnedFor: "most honorable kills gained", tier: T.rare,
    flavor: "The battleground queue popped and the other side regretted it." },
  "killing-blows-gained": { title: "Sharpshooter", icon: Target, earnedFor: "most killing blows gained", tier: T.rare,
    flavor: "One shot, one kill, one fewer rival." },
  "total-kills-gained": { title: "Rampage", icon: Zap, earnedFor: "most total kills gained", tier: T.rare,
    flavor: "The quest said ten boars. They brought twenty." },
  "prof-alchemy": { title: "Mad Alchemist", icon: FlaskConical, earnedFor: "top Alchemy", tier: T.uncommon,
    flavor: "Brews first, reads the warning label later." },
  "prof-blacksmithing": { title: "Forgemaster", icon: Hammer, earnedFor: "top Blacksmithing", tier: T.uncommon,
    flavor: "Hammers out gear while everyone else queues for the anvil." },
  "prof-enchanting": { title: "Runeweaver", icon: Sparkles, earnedFor: "top Enchanting", tier: T.uncommon,
    flavor: "Turns your vendor trash into dust and your dust into dreams." },
  "prof-engineering": { title: "Gadgeteer", icon: Wrench, earnedFor: "top Engineering", tier: T.uncommon,
    flavor: "Every invention works. Some of them even work as intended." },
  "prof-leatherworking": { title: "Hidewright", icon: Backpack, earnedFor: "top Leatherworking", tier: T.uncommon,
    flavor: "Wears what they skinned. Fashion is a blood sport." },
  "prof-tailoring": { title: "Threadmaster", icon: Scissors, earnedFor: "top Tailoring", tier: T.uncommon,
    flavor: "Will make you a bag. Will not make it cheap." },
  "prof-herbalism": { title: "Greenthumb", icon: Leaf, earnedFor: "top Herbalism", tier: T.uncommon,
    flavor: "Peacebloom? Silverleaf? Bring a bigger bag." },
  "prof-mining": { title: "Deepdelver", icon: Pickaxe, earnedFor: "top Mining", tier: T.uncommon,
    flavor: "Dug too greedily and too deep, and loved every swing." },
  "prof-skinning": { title: "Pelt Taker", icon: PawPrint, earnedFor: "top Skinning", tier: T.uncommon,
    flavor: "No boar leaves with its hide." },
  "prof-cooking": { title: "Hearthcook", icon: ChefHat, earnedFor: "top Cooking", tier: T.uncommon,
    flavor: "Will cook for Westfall Stew." },
  "prof-firstaid": { title: "Field Medic", icon: HeartPulse, earnedFor: "top First Aid", tier: T.uncommon,
    flavor: "Linen bandages are a whole philosophy." },
  "prof-fishing": { title: "Lake Lurker", icon: Fish, earnedFor: "top Fishing", tier: T.uncommon,
    flavor: "Has strong opinions about bobbers." },
};

/** A board hands out its title once this many members are on it. */
export const GUILD_TITLE_MIN_RANKED = 3;
/** A profession title needs at least this skill (anyone can have 1 Cooking). */
export const GUILD_TITLE_PROFESSION_FLOOR = 75;
/** More leaders tied than this share of the board (and at least the minimum) means nobody gets it: "everyone's 60" isn't a title. */
export const GUILD_TITLE_TIE_SHARE = 0.25;
export const GUILD_TITLE_TIE_MIN = 3;
/** A member's list shows their rarest titles, up to this many; the rest are behind "+N". */
export const GUILD_TITLE_SHOWN = 3;
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
  heading: "Hall of Titles",
  listLabel: "Titles and who holds them",
  tagline: "Every board has a champion. Come and take it.",
  note: "Given by this site to each board's leader, from the guild's stats. Not in-game titles.",
  empty: `Titles show up once at least ${GUILD_TITLE_MIN_RANKED} members are on a leaderboard.`,
  weekly: "This week",
  showMore: (count: number) => `Show ${count} more guild ${count === 1 ? "title" : "titles"}`,
  showFewer: "Show fewer guild titles",
  skipped: (title: string, earnedFor: string) => `${title} (${earnedFor}): not given, too many members are tied.`,
} as const;

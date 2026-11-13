import type { GuildTitleTier } from "@/games/wow-forever/types/guild/guildTitleTier";
import type { GuildTitleTierStyle } from "@/games/wow-forever/types/guild/guildTitleTierStyle";

/** Title rarities, named for the game's item qualities. */
export const GUILD_TITLE_TIERS = {
  poor: "poor",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
} as const;

/**
 * Each tier wears its item-quality colour (grey #9d9d9d, green #1eff00, blue #0070dd, purple #a335ee, orange #ff8000).
 * The medallion is a dark gradient with the colour as its border and glow, so the white icon always reads; the name
 * beside it is a darker tint of the colour on a light card (4.5:1) and the colour itself, lifted where it must be, on a dark one.
 */
export const GUILD_TITLE_TIER_STYLES: Readonly<Record<GuildTitleTier, GuildTitleTierStyle>> = {
  poor: {
    label: "Poor",
    rank: 0,
    medallion: "border-[#9d9d9d] from-[#7a7a7a] to-[#383838] shadow-[0_0_8px_1px_rgba(157,157,157,0.45)]",
    name: "text-[#5c5c5c] dark:text-[#b4b4b4]",
    tint: "border-[#9d9d9d]/50 bg-[#9d9d9d]/10",
    shine: false,
  },
  uncommon: {
    label: "Uncommon",
    rank: 1,
    medallion: "border-[#1eff00] from-[#17802a] to-[#073a14] shadow-[0_0_10px_1px_rgba(30,255,0,0.4)]",
    name: "text-[#0d6e1c] dark:text-[#1eff00]",
    tint: "border-[#1eff00]/40 bg-[#1eff00]/10",
    shine: false,
  },
  rare: {
    label: "Rare",
    rank: 2,
    medallion: "border-[#0070dd] from-[#1a6fd0] to-[#06284f] shadow-[0_0_12px_2px_rgba(0,112,221,0.5)]",
    name: "text-[#0058b0] dark:text-[#4da6ff]",
    tint: "border-[#0070dd]/50 bg-[#0070dd]/10",
    shine: false,
  },
  epic: {
    label: "Epic",
    rank: 3,
    medallion: "border-[#a335ee] from-[#8a3bc9] to-[#2a0f45] shadow-[0_0_14px_2px_rgba(163,53,238,0.55)]",
    name: "text-[#7a1fb8] dark:text-[#c084ff]",
    tint: "border-[#a335ee]/50 bg-[#a335ee]/10",
    shine: true,
  },
  legendary: {
    label: "Legendary",
    rank: 4,
    medallion: "border-[#ff8000] from-[#d96a00] to-[#5c2a00] shadow-[0_0_18px_3px_rgba(255,128,0,0.6)]",
    name: "text-[#a84300] dark:text-[#ff8000]",
    tint: "border-[#ff8000]/60 bg-[#ff8000]/10",
    shine: true,
  },
};

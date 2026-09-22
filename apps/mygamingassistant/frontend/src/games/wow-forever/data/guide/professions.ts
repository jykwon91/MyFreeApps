import type { AddonPick, ProfessionPair } from "@/games/wow-forever/data/guide/guideTypes";

/** You can have two main professions; First Aid, Cooking and Fishing are extra. */
export const PROFESSION_PAIRS: readonly ProfessionPair[] = [
  { pair: "Mining + Blacksmithing", goodFor: "Warriors, Paladins", why: "Mine your own ore and craft plate armor and weapons." },
  { pair: "Mining + Engineering", goodFor: "Anyone, especially PvP", why: "Bombs, gadgets and scopes; Engineering eats a lot of ore, so mine it yourself." },
  { pair: "Herbalism + Alchemy", goodFor: "Everyone, especially raiders", why: "Potions and flasks for every fight, from herbs you pick." },
  { pair: "Skinning + Leatherworking", goodFor: "Rogues, Hunters, Druids, Shamans", why: "Skin what you kill and craft leather or mail gear and armor kits." },
  { pair: "Tailoring + Enchanting", goodFor: "Mages, Priests, Warlocks", why: "Make cloth gear from cloth you loot, then disenchant it for enchanting materials." },
  { pair: "Two gathering professions", goodFor: "Making gold", why: "Herbalism, Mining or Skinning together sell well on the auction house while you level." },
];

/** Popular Classic addons. Forever's addon policy isn't confirmed yet. */
export const ADDON_PICKS: readonly AddonPick[] = [
  { name: "Questie", what: "Shows quest objectives, pickups and turn-ins on your map." },
  { name: "Auctionator", what: "Makes buying and selling on the auction house much faster." },
  { name: "Details! Damage Meter", what: "Shows damage, healing and threat numbers for you and your group." },
  { name: "Pawn", what: "Scores gear with stat weights and marks upgrades in tooltips." },
  { name: "Deadly Boss Mods", what: "Boss-fight timers and warnings for dungeons and raids." },
];

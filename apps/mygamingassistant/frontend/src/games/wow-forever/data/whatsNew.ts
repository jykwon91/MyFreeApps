import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

/**
 * The hub's "What's new on this site" list — hand-written, NEWEST FIRST
 * (a test checks the order). Date = the day the change merged to main.
 *
 * `to` decides which page's update dot the entry lights: its path must be the
 * hub (`/wow-forever`) or a hub tile's path from `games/registry.ts` (a test
 * checks; triage carries no dot, and an item page counts as the Items page). An entry is remembered as seen by
 * its date + title, so retitling one shows its dot again. Write for players:
 * what they can do now, in one sentence.
 */
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    date: "2026-11-12",
    title: "Guild gains this week",
    summary:
      "Your guild's leaderboards now rank who gained the most levels, dungeon clears, honorable kills and kills over the last week.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Who in your guild can craft it",
    summary:
      "Search a recipe on your guild's page to see which members know it and their skill in that profession.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Guild leaderboards",
    summary:
      "Your guild's page now ranks its members by level, dungeons cleared, honorable kills, exalted reputations, each profession's skill and more, with your own character marked.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Guild pages",
    summary:
      "Select the guild on your character page to see its members — search by name, filter by class or level, sort by rank or item level, and open anyone's character.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Your character: dungeons done",
    summary: "Your character page now lists every dungeon, done or not, by its final boss kills, and which ones fit your level now.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Your character: mounts and pets",
    summary: "Your character page now lists every mount and pet you've collected.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Your character: PvP",
    summary:
      "Your character page now shows your PvP rank, honorable kills and where you made most of them, and how often other players have killed you.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Your character: reputation",
    summary:
      "Your character page now shows your standing with every faction you've met, grouped as in game with progress to the next level, and warns when a goblin town's guards will attack you.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-12",
    title: "Your character: professions and recipes",
    summary:
      "Your character page now shows your professions and every recipe and enchant you know, coloured by whether it still gives you skill points, with a link to the guide from your skill.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-11",
    title: "Your character: talent trees like in game",
    summary:
      "Your character's talents now show as the game's talent trees, with every talent in place, your ranks on each and the arrows between them. Tap a talent to read what it does.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-11",
    title: "Your character: talents",
    summary:
      "Your character page now shows the talents you picked, with your point split and what each rank does, and opens your build in the talent calculator in one tap.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-11",
    title: "Talents: Forever's live trees",
    summary:
      "The talent calculator now shows Forever's live talent trees and tooltips, straight from Blizzard, with talents Classic never had marked New in Forever. Old build links start empty, so plan your build again.",
    to: "/wow-forever/talents",
  },
  {
    date: "2026-11-11",
    title: "Your character: stats",
    summary:
      "Your character page now shows the character pane's numbers too: health, armor, the five attributes with what your gear adds, Melee, Ranged, Spell and Defenses, and resistances.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-11",
    title: "Your character",
    summary:
      "Type your character's first name and surname to see them in their gear, with the stats each item rolled, straight from Blizzard. No login needed.",
    to: "/wow-forever/character",
  },
  {
    date: "2026-11-11",
    title: "Addon: why a material is expensive",
    summary:
      "Download the MGA Prices addon again: a crafting material's tooltip now says what it's wanted for, the most valuable thing it goes into on your auction house, even when that craft no longer pays.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-11",
    title: "Trainers: what your demons learn",
    summary:
      "Warlocks: the Trainers page now lists what your Imp, Voidwalker, Succubus and Felhunter learn at each level, with the Grimoire to buy from a Demon trainer for each rank.",
    to: "/wow-forever/trainers",
  },
  {
    date: "2026-11-11",
    title: "Addon: sell on the AH or vendor it",
    summary:
      "Download the MGA Prices addon again: an item on sale at your auction house now says in its tooltip whether to sell it there or vendor it, weighing what the house pays after its cut against the vendor's price.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-11",
    title: "Class icons in drop-downs",
    summary: "Every class drop-down (Best gear, Item Compare, food, gold, downrank and the World Map) shows your class's in-game icon beside it.",
    to: "/wow-forever/gear",
  },
  {
    date: "2026-11-11",
    title: "Class and profession icons",
    summary:
      "Classes, professions, talent trees, racials and pet abilities now show their in-game icons in pickers, headings and lists: Professions, Talents, Macros, Races, Hunter pets and Making gold.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-11",
    title: "In-game icons on every item",
    summary:
      "Every item the site names now shows its in-game icon: auction prices, crafting routes and materials, food, gathering, gold farms, gear, Item Compare, quests and Ask answers.",
    to: "/wow-forever",
  },
  {
    date: "2026-11-11",
    title: "Trainers: in-game icons",
    summary:
      "The Trainers page now shows each class's and profession's in-game icon in the picker, and every spell you can learn has its in-game icon next to its name.",
    to: "/wow-forever/trainers",
  },
  {
    date: "2026-11-11",
    title: "Trainers: what unlocks when",
    summary:
      "Pick a class to see every spell you can learn at each level, with your next training visit marked, or a profession to see each rank's skill and level needs, plus where every trainer for your faction stands.",
    to: "/wow-forever/trainers",
  },
  {
    date: "2026-11-09",
    title: "Addon: prices on chat links",
    summary:
      "Download the MGA Prices addon again: every item link in chat now has its auction price written after it, hovering a link shows its priced tooltip, and clicking a soulbound item's link says why it has no price.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-09",
    title: "Addon: which materials crafters want",
    summary:
      "Download the MGA Prices addon again: mousing over a crafting material now shows which profession leveling routes use it and the best craft that pays with it on your auction house right now, the demand that can push its price up.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-09",
    title: "Tag macros: paste a mob's name",
    summary:
      "On the Macros page, paste a rare's or quest mob's name and copy a macro that targets it by its exact name and casts Corruption (or any spell you type) the moment you press it, so you get the tag first.",
    to: "/wow-forever/macros",
  },
  {
    date: "2026-11-09",
    title: "Auction prices in your game tooltips",
    summary:
      "Download the MGA Prices addon from the Auction house page and mouse over any item in game to see what it sells for on your faction's auction house, the whole stack's worth, or every house while you hold Shift. Download it again to refresh the prices.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-09",
    title: "Auction house: a profession's materials and a recipe's cost",
    summary:
      "Pick a profession on the Auction house page to see only its materials (Enchanting shows dusts, essences and rods, not cloth), then pick one of its recipes to see what each material costs, the total for one craft, what the item sells for and the difference.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-09",
    title: "Real auction-house prices from the PvP server",
    summary:
      "Prices now come straight from the in-game auction house of the PvP server, its Alliance, Horde and Blackwater houses each on their own, replacing the old estimate. Each price shows what it really sells for, the cheapest listing and how many are on sale, and every page uses your saved faction (switch it on the Auction house page). Other server types come later.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-08",
    title: "Auction prices are US only",
    summary:
      "Every price on the site now comes from the US auction house, so there's no region to pick: the credit under each price says \"(US)\". Server status still has its own region picker.",
    to: "/wow-forever/auction-house",
  },
  {
    date: "2026-11-08",
    title: "Ask about auction prices and server status",
    summary:
      "Ask “how much is Linen Cloth selling for?” or “are the servers up?” and the chat shows the auction-house price (from TradeSkillMaster, with when it was updated) or each server's status, and says so plainly when prices are old or missing or the status couldn't be checked.",
    to: "/wow-forever/ask",
  },
  {
    date: "2026-11-08",
    title: "Ask about rares, professions, gold and macros",
    summary:
      "Ask now answers “any rares worth killing at level 30?”, “how do I level Tailoring from 150?”, “where can I farm gold at 40?” and “best warlock macros” in the chat, with a map and a route there for rares and farm spots, the macro text to copy, and a link to the full page when you want more.",
    to: "/wow-forever/ask",
  },
  {
    date: "2026-11-08",
    title: "Legacy planner",
    summary:
      "Plan a character's 16 Legacy points across Professions, Adventure and Resourcefulness, share the plan as a link, tick off the 65 challenges that earn points and see the account rank rewards.",
    to: "/wow-forever/legacy",
  },
  {
    date: "2026-11-08",
    title: "Library books",
    summary:
      "See all 40 library books in the WoW Forever game files, the Friend of the Library reward (a choice of two necklaces) and tick off the books you've found.",
    to: "/wow-forever/library",
  },
  {
    date: "2026-11-08",
    title: "Hunter pets",
    summary:
      "See every pet family's damage, armor and health, every pet ability rank with the beasts that teach it, and search all tamable beasts by level, zone and attack speed.",
    to: "/wow-forever/hunter-pets",
  },
  {
    date: "2026-11-08",
    title: "Every rank trainer in the profession guides",
    summary:
      "Journeyman, Expert and Artisan steps now list every trainer who teaches that rank to your faction, with the one in your zone first, plus a map link for each. Cooking and Fishing steps name the trainers and the Artisan quest giver too.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-08",
    title: "Quests",
    summary:
      "Browse every quest the WoW Forever client knows: search by name, filter by zone, faction or level, and open any quest to see who gives it, what to do, what you get and which quests come before or after it.",
    to: "/wow-forever/quests",
  },
  {
    date: "2026-11-08",
    title: "Classes",
    summary:
      "Pick any of the nine classes to see its icon, roles, resource type, races (with new-in-Forever combos), armor and weapon proficiencies, and direct links to its spellbook, talents, macros, downrank calculator and what Forever changed.",
    to: "/wow-forever/classes",
  },
  {
    date: "2026-11-08",
    title: "Talent calculator: spend order and Compare to Classic",
    summary:
      "The talent calculator now records the order you spend points (level 10, 11, …) and shows it as a shareable list you can undo from the end. Turn on Compare to Classic to see which talents changed from the Classic Era, with side-by-side Forever and Classic text in the detail panel.",
    to: "/wow-forever/talents",
  },
  {
    date: "2026-11-08",
    title: "Spellbook",
    summary:
      "See every spell your class can train in Forever: each rank's learn level, trainer cost and tooltip, which spells are different from Classic, and links to the talent and downrank calculators.",
    to: "/wow-forever/spellbook",
  },
  {
    date: "2026-11-08",
    title: "Recipe vendors in every profession guide",
    summary:
      "Each profession guide now lists every recipe a vendor sells, grouped by vendor with price, limited stock and directions on the World Map, and route rows say which vendor near you sells the recipe to buy.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-08",
    title: "Ask",
    summary:
      "Ask where something is in plain words — “where's the closest warlock trainer if I'm in Desolace?” — and get the answer from this site's own data on a small map, with a route there on the World Map.",
    to: "/wow-forever/ask",
  },
  {
    date: "2026-11-08",
    title: "Item browser",
    summary:
      "Browse every item the Forever game files have shown so far: search by name, filter by quality, slot, armor or weapon type and level, see what Forever changed or added, and open any item for its tooltip and how to get it.",
    to: "/wow-forever/items",
  },
  {
    date: "2026-11-08",
    title: "Races",
    summary:
      "See every race's faction, starting zone, classes and racial traits — including the two new Skyborne races — with each racial Forever changed shown next to its Classic text.",
    to: "/wow-forever/races",
  },
  {
    date: "2026-11-07",
    title: "Rares finder",
    summary:
      "Find rare and rare elite creatures by zone and level: where they spawn, what they drop, a /target macro to spot them and a list to tick off — and pin them on the World Map with the new Rares layer.",
    to: "/wow-forever/rares",
  },
  {
    date: "2026-11-07",
    title: "Downrank calculator",
    summary:
      "Pick a heal or damage spell and see which rank gives the most per mana and per second for your level and +healing or +spell damage, with the macro line to cast that rank.",
    to: "/wow-forever/downrank",
  },
  {
    date: "2026-11-07",
    title: "Server status history and login help",
    summary:
      "See how the realms have been over the last day or week, every recent outage with how long it lasted, and what to try for common login errors like WOW51900319.",
    to: "/wow-forever/server-status",
  },
  {
    date: "2026-11-07",
    title: "Changes vs Classic",
    summary:
      "See every talent, class spell, item, quest and zone Forever changed or added, with the Classic and Forever values side by side, filtered by category, class or a search.",
    to: "/wow-forever/changes",
  },
  {
    date: "2026-11-07",
    title: "Talent calculator",
    summary:
      "Plan a talent build for any class and level with Forever's own talent text, see where a talent changed from Classic, and share the build as a link.",
    to: "/wow-forever/talents",
  },
  {
    date: "2026-11-07",
    title: "Dungeon quests",
    summary:
      "Each dungeon page now lists its quests for your faction: who gives them (with a link to them on the World Map), the quests that lead up to them, what to do inside and what you get.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Gnomeregan and Blackfathom boss lists",
    summary:
      "Gnomeregan's page now lists all five bosses with their drops, and Blackfathom Deeps shows its last three bosses too, Aku'mai included, each with a walking route inside.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Dungeon pages",
    summary:
      "Open any dungeon to see when you can go (level, group size, keys), where it is (nearest flight path, walking directions, each wing's bosses), its bosses in order and what each boss drops, with drop chances.",
    to: "/wow-forever/dungeons",
  },
  {
    date: "2026-11-07",
    title: "Satellite view on the World Map",
    summary:
      "Switch a zone or city on the World Map to Satellite to see the real ground from above, the way your minimap shows it, with every marker and route still in place.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Your own marks, routes and shareable maps",
    summary:
      "Right-click the World Map (or press and hold on a phone) to drop your own marks, join them into a route with the distance in yards, and share a link that opens the same map, marks and route for a friend.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Map layers and where to level",
    summary:
      "Pick what the World Map shows — flight masters, inns, trainers, quest givers, herbs, ore and more, each with how many are on the map — and see every zone's levels, coloured by how well it suits your level.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Zoom and drag the World Map",
    summary:
      "Zoom into any map with the scroll wheel, a pinch or the + and − buttons, and drag it around to look closer at towns, roads and markers.",
    to: "/wow-forever/map",
  },
  {
    date: "2026-11-07",
    title: "Source tags on every page",
    summary:
      "One set of tags shows where each fact comes from: seen in game, official, game files, Classic data or unconfirmed. Hover or tap a tag to see what it means.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-07",
    title: "Item tooltips",
    summary: "Hover over an item name, or tab to it, to see its in-game tooltip.",
    to: "/wow-forever/gear",
  },
  {
    date: "2026-11-07",
    title: "My lists",
    summary: "Build your own gear lists on Best gear, tick off what you have and share a list with a link.",
    to: "/wow-forever/gear?view=mine",
  },
  {
    date: "2026-11-07",
    title: "Item pages",
    summary:
      "Every item has its own page: its stats and how to get it, from vendors and quests to drops, each with its source tag. Best gear links to them.",
    to: "/wow-forever/gear",
  },
  {
    date: "2026-11-07",
    title: "Game icons in Professions",
    summary: "Recipes, materials and spells in the profession guides now show their in-game icons.",
    to: "/wow-forever/professions",
  },
  {
    date: "2026-11-07",
    title: "Items added since launch",
    summary: "Items Blizzard added or changed by hotfix now show up in item search, Item Compare and Best gear.",
    to: "/wow-forever/compare",
  },
  {
    date: "2026-11-07",
    title: "Collapsible side menu",
    summary: "Shrink the left menu to icons to give the page more room.",
    to: "/wow-forever",
  },
  {
    date: "2026-11-07",
    title: "One Macros page",
    summary: "Mouseover and other macros for every class on one page, with hover-cast macros first.",
    to: "/wow-forever/macros",
  },
];

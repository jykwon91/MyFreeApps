/**
 * Which World Map service a captured NPC is, from what the addon could see:
 * its title ("<Warlock Trainer>") and what it offered when talked to.
 *
 * The in-game client doesn't expose the NPC flags the Classic generator
 * classifies by (`backend/scripts/wow_world_map/classify.py`), so this reads
 * titles instead. Profession keywords mirror that file — change both together.
 */
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { SERVICE_KIND, type ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";

/** What the addon saw an NPC offer (Capture.lua OFFER_EVENTS + repair). */
export const NPC_OFFER = {
  trainer: "trainer",
  tradeskill: "tradeskill",
  taxi: "taxi",
  bank: "bank",
  auction: "auction",
  stable: "stable",
  repair: "repair",
} as const;
export type NpcOffer = (typeof NPC_OFFER)[keyof typeof NPC_OFFER];

export interface ServiceClass {
  subkind: ServiceKind;
  tag: string;
}

// Ordered: first matching keyword wins. Mirrors classify.py PROFESSION_KEYWORDS.
const PROFESSION_KEYWORDS: readonly (readonly [string, string])[] = [
  ["First Aid", "first_aid"],
  ["Physician", "first_aid"],
  ["Trauma Surgeon", "first_aid"],
  ["Alchemist", "alchemy"],
  ["Blacksmith", "blacksmithing"],
  ["Armor Crafter", "blacksmithing"],
  ["Weapon Crafter", "blacksmithing"],
  ["Armorsmith", "blacksmithing"],
  ["Weaponsmith", "blacksmithing"],
  ["Enchant", "enchanting"],
  ["Engineer", "engineering"],
  ["Herbalis", "herbalism"],
  ["Leatherwork", "leatherworking"],
  ["Leathercraft", "leatherworking"],
  ["Mining", "mining"],
  ["Miner", "mining"],
  ["Skinn", "skinning"],
  ["Tailor", "tailoring"],
  ["Cook", "cooking"],
  ["Butcher", "cooking"],
  ["Fish", "fishing"],
];

/** Titles that teach a profession (as opposed to "Tailoring Supplies" vendors). */
const TEACHER_TITLE = /\b(Trainer|Expert|Artisan|Journeyman|Apprentice|Master|Physician|Surgeon)\b/;
const SELLER_TITLE = /\b(Supplies|Goods|Vendor|Merchant)\b/;
const FLIGHT_TITLE = /\b(Flight Master|Gryphon Master|Wind Rider Master|Hippogryph Master|Bat Handler)\b/;
const CLASS_TRAINER_TITLE = /^(\w+) Trainer$/;

function professionFor(title: string): string | null {
  const found = PROFESSION_KEYWORDS.find(([keyword]) => title.includes(keyword));
  return found ? found[1] : null;
}

function classFor(title: string): string | null {
  const match = CLASS_TRAINER_TITLE.exec(title);
  const name = match?.[1].toLowerCase();
  return WOW_CLASSES.find((c) => c.name.toLowerCase() === name)?.id ?? null;
}

function trainerClass(title: string, offers: ReadonlySet<NpcOffer>): ServiceClass | null {
  if (title === "Demon Trainer" || title === "Demon Master") return { subkind: SERVICE_KIND.demonTrainer, tag: "warlock" };
  if (title === "Weapon Master") return { subkind: SERVICE_KIND.weaponMaster, tag: "" };
  if (title === "Pet Trainer") return { subkind: SERVICE_KIND.petTrainer, tag: "hunter" };
  if (title.includes("Riding")) return { subkind: SERVICE_KIND.ridingTrainer, tag: "" };
  const cls = classFor(title);
  if (cls) return { subkind: SERVICE_KIND.classTrainer, tag: cls };
  const profession = professionFor(title);
  const teaches = offers.has(NPC_OFFER.tradeskill) || (TEACHER_TITLE.test(title) && !SELLER_TITLE.test(title));
  if (profession && teaches) return { subkind: SERVICE_KIND.professionTrainer, tag: profession };
  return null;
}

/** The service a captured NPC provides, or null if the map doesn't show it. */
export function classifyCapturedNpc(title: string, offers: ReadonlySet<NpcOffer>): ServiceClass | null {
  const trainer = trainerClass(title, offers);
  if (trainer) return trainer;
  if (offers.has(NPC_OFFER.taxi) || FLIGHT_TITLE.test(title)) return { subkind: SERVICE_KIND.flightMaster, tag: "" };
  if (offers.has(NPC_OFFER.bank) || title === "Banker") return { subkind: SERVICE_KIND.banker, tag: "" };
  if (offers.has(NPC_OFFER.auction) || title === "Auctioneer") return { subkind: SERVICE_KIND.auctioneer, tag: "" };
  if (title === "Innkeeper") return { subkind: SERVICE_KIND.innkeeper, tag: "" };
  if (offers.has(NPC_OFFER.stable) || title === "Stable Master") return { subkind: SERVICE_KIND.stableMaster, tag: "" };
  if (offers.has(NPC_OFFER.repair)) return { subkind: SERVICE_KIND.repair, tag: "" };
  return null;
}

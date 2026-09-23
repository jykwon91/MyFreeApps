/**
 * Service NPC types on the World Map.
 *
 * Values mirror the generator's classifier
 * (`backend/scripts/wow_world_map/classify.py`) — change both together.
 */
export const SERVICE_KIND = {
  classTrainer: "class_trainer",
  demonTrainer: "demon_trainer",
  petTrainer: "pet_trainer",
  professionTrainer: "profession_trainer",
  weaponMaster: "weapon_master",
  ridingTrainer: "riding_trainer",
  flightMaster: "flight_master",
  banker: "banker",
  auctioneer: "auctioneer",
  innkeeper: "innkeeper",
  stableMaster: "stable_master",
  repair: "repair",
} as const;

export type ServiceKind = (typeof SERVICE_KIND)[keyof typeof SERVICE_KIND];

export const SERVICE_KINDS: readonly ServiceKind[] = Object.values(SERVICE_KIND);

export function isServiceKind(value: unknown): value is ServiceKind {
  return SERVICE_KINDS.some((k) => k === value);
}

export const SERVICE_LABEL: Readonly<Record<ServiceKind, string>> = {
  class_trainer: "Class trainer",
  demon_trainer: "Demon trainer",
  pet_trainer: "Pet trainer",
  profession_trainer: "Profession trainer",
  weapon_master: "Weapon master",
  riding_trainer: "Riding trainer",
  flight_master: "Flight master",
  banker: "Bank",
  auctioneer: "Auction house",
  innkeeper: "Innkeeper",
  stable_master: "Stable master",
  repair: "Repair / vendor",
};

/** Map marker colour per type (Tailwind fill classes on the SVG marker). */
export const SERVICE_MARKER_CLASS: Readonly<Record<ServiceKind, string>> = {
  class_trainer: "fill-violet-500",
  demon_trainer: "fill-fuchsia-600",
  pet_trainer: "fill-lime-600",
  profession_trainer: "fill-teal-500",
  weapon_master: "fill-slate-500",
  riding_trainer: "fill-amber-700",
  flight_master: "fill-sky-500",
  banker: "fill-yellow-500",
  auctioneer: "fill-orange-500",
  innkeeper: "fill-rose-500",
  stable_master: "fill-emerald-600",
  repair: "fill-zinc-400",
};

export const PROFESSION_LABEL: Readonly<Record<string, string>> = {
  alchemy: "Alchemy",
  blacksmithing: "Blacksmithing",
  cooking: "Cooking",
  enchanting: "Enchanting",
  engineering: "Engineering",
  first_aid: "First Aid",
  fishing: "Fishing",
  herbalism: "Herbalism",
  leatherworking: "Leatherworking",
  mining: "Mining",
  skinning: "Skinning",
  tailoring: "Tailoring",
};

/**
 * Which service NPCs a row / filter shows.
 *
 * The hero list ("Nearest services") has one row per everyday need, your
 * class trainer first. The "Find" picker offers the same plus the less
 * common services under "More" (stable masters, professions, riding, repair).
 * Trainers are never filtered by level — you visit them at every level.
 */
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { PROFESSION_LABEL, SERVICE_KIND, SERVICE_LABEL, type ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { MapPoi } from "@/games/wow-forever/types/worldMap";

export interface ServiceFilter {
  id: string;
  label: string;
  /** `showAllClasses` widens class trainers to every class. */
  matches: (poi: MapPoi, showAllClasses: boolean) => boolean;
}

function bySubkind(kind: ServiceKind, label = SERVICE_LABEL[kind]): ServiceFilter {
  return { id: kind, label, matches: (poi) => poi.subkind === kind };
}

function classTrainer(classId: WowClassId): ServiceFilter {
  const name = findClass(classId)?.name ?? "Class";
  return {
    id: SERVICE_KIND.classTrainer,
    label: `${name} trainer`,
    matches: (poi, showAllClasses) =>
      poi.subkind === SERVICE_KIND.classTrainer && (showAllClasses || poi.tag === classId),
  };
}

/** Class-only trainers besides the class trainer: Warlock demons, Hunter pets. */
function companionTrainer(classId: WowClassId): ServiceFilter | null {
  if (classId === "warlock") return bySubkind(SERVICE_KIND.demonTrainer);
  if (classId === "hunter") return bySubkind(SERVICE_KIND.petTrainer);
  return null;
}

const EVERYDAY: readonly ServiceKind[] = [
  SERVICE_KIND.flightMaster,
  SERVICE_KIND.innkeeper,
  SERVICE_KIND.banker,
  SERVICE_KIND.auctioneer,
  SERVICE_KIND.weaponMaster,
];

export function heroFilters(classId: WowClassId): ServiceFilter[] {
  const companion = companionTrainer(classId);
  return [classTrainer(classId), ...(companion ? [companion] : []), ...EVERYDAY.map((k) => bySubkind(k))];
}

export interface FilterGroup {
  label: string;
  filters: ServiceFilter[];
}

/** Options for the "Find" picker: the everyday set, then "More". */
export function findFilterGroups(classId: WowClassId): FilterGroup[] {
  const professions = Object.entries(PROFESSION_LABEL)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([tag, name]): ServiceFilter => ({
      id: `profession:${tag}`,
      label: `${name} trainer`,
      matches: (poi) => poi.subkind === SERVICE_KIND.professionTrainer && poi.tag === tag,
    }));
  const otherCompanion: ServiceFilter[] = [SERVICE_KIND.demonTrainer, SERVICE_KIND.petTrainer]
    .filter((k) => companionTrainer(classId)?.id !== k)
    .map((k) => bySubkind(k));
  return [
    { label: "Everyday", filters: heroFilters(classId) },
    {
      label: "More",
      filters: [
        bySubkind(SERVICE_KIND.stableMaster),
        bySubkind(SERVICE_KIND.ridingTrainer),
        bySubkind(SERVICE_KIND.repair),
        ...otherCompanion,
        ...professions,
      ],
    },
  ];
}

export function findFilter(classId: WowClassId, id: string): ServiceFilter {
  const all = findFilterGroups(classId).flatMap((g) => g.filters);
  return all.find((f) => f.id === id) ?? all[0];
}

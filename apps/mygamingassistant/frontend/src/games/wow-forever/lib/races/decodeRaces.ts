/**
 * The races page's data from the generator's two files: the Forever side
 * (`races/races.json` — races, classes, each racial's status and Forever text)
 * and the Classic side (`races/classic/racials.json` — Classic starting zones
 * and the Classic text of every changed or removed racial).
 */
import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { RACE_FACTION, RACIAL_KIND, RACIAL_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import type { Race } from "@/games/wow-forever/types/races/race";
import type { RaceFaction } from "@/games/wow-forever/types/races/raceFaction";
import type { RacesData } from "@/games/wow-forever/types/races/racesData";
import type { RacesDataFiles } from "@/games/wow-forever/types/races/racesDataFiles";
import type { RaceStartZone } from "@/games/wow-forever/types/races/raceStartZone";
import type { RaceVariantDoc } from "@/games/wow-forever/types/races/raceVariantDoc";
import type { RacialKind } from "@/games/wow-forever/types/races/racialKind";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";
import type { RacialVariant } from "@/games/wow-forever/types/races/racialVariant";

const CLASS_IDS: ReadonlySet<string> = new Set(WOW_CLASSES.map((c) => c.id));
const FACTIONS: ReadonlySet<string> = new Set(Object.values(RACE_FACTION));
const STATUSES: ReadonlySet<string> = new Set(Object.values(RACIAL_STATUS));
const KINDS: ReadonlySet<string> = new Set(Object.values(RACIAL_KIND));

function classIds(file: string, ids: readonly string[]): WowClassId[] {
  return ids.map((id) => {
    if (!CLASS_IDS.has(id)) throw new Error(`${file}: unknown class "${id}"`);
    return id as WowClassId;
  });
}

function variants(file: string, docs: readonly RaceVariantDoc[]): RacialVariant[] {
  return docs.map((v) => ({ classes: v.classes === null ? null : classIds(file, v.classes), text: v.text }));
}

function oneOf<T extends string>(file: string, what: string, value: string, allowed: ReadonlySet<string>): T {
  if (!allowed.has(value)) throw new Error(`${file}: unknown ${what} "${value}"`);
  return value as T;
}

/** The decoded page data; an unknown class, faction, status or kind throws (the generator and page disagree). */
export function decodeRaces(files: RacesDataFiles): RacesData {
  const races: Race[] = files.forever.races.map((race) => {
    const classic = files.classic.races[String(race.id)];
    let startZone: RaceStartZone | null = null;
    if (classic?.startZone) startZone = { ...classic.startZone, basis: "classic" };
    else if (race.startZone) startZone = { ...race.startZone, basis: "unconfirmed" };
    return {
      id: race.id,
      slug: race.slug,
      name: race.name,
      faction: oneOf<RaceFaction>("races.json", "faction", race.faction, FACTIONS),
      newInForever: race.newInForever,
      classes: classIds("races.json", race.classes),
      newClasses: classIds("races.json", race.newClasses),
      startZone,
      racials: race.racials.map((r) => {
        const classicText = classic?.racials[r.key];
        return {
          key: r.key,
          name: r.name,
          kind: oneOf<RacialKind>("races.json", "kind", r.kind, KINDS),
          status: oneOf<RacialStatus>("races.json", "status", r.status, STATUSES),
          icon: r.icon,
          variants: variants("races.json", r.variants),
          classicVariants: classicText ? variants("racials.json", classicText.variants) : null,
          wasName: r.wasName ?? null,
          partial: r.partial === true,
        };
      }),
    };
  });
  return { races, clientBuild: files.forever.clientBuild, classicBuild: files.forever.classicBuild };
}

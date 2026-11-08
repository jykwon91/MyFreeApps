import type { RaceStartZoneDoc } from "@/games/wow-forever/types/races/raceStartZoneDoc";
import type { RaceVariantDoc } from "@/games/wow-forever/types/races/raceVariantDoc";

/** The two generated files as they sit on disk (`data/races/`), before decoding. */
export interface RacesDataFiles {
  forever: {
    clientBuild: string;
    classicBuild: string;
    races: readonly {
      id: number;
      slug: string;
      name: string;
      faction: string;
      newInForever: boolean;
      classes: readonly string[];
      newClasses: readonly string[];
      startZone?: RaceStartZoneDoc;
      racials: readonly {
        key: string;
        name: string;
        kind: string;
        status: string;
        icon: number;
        variants: readonly RaceVariantDoc[];
        wasName?: string;
        partial?: boolean;
      }[];
    }[];
  };
  classic: {
    races: Readonly<
      Record<
        string,
        { startZone?: RaceStartZoneDoc; racials: Readonly<Record<string, { variants: readonly RaceVariantDoc[] }>> }
      >
    >;
  };
}

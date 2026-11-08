import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentOrderEntry } from "@/games/wow-forever/types/talents/talentOrderEntry";

/** The calculator's build, level and spend order — all kept in the URL. */
export interface TalentBuildState {
  build: TalentBuild;
  level: number;
  /** The lowest level the build's points allow (the level stepper's floor). */
  minLevel: number;
  /** The page was opened with a `?b=` this class can't have; the build started empty. */
  brokenLink: boolean;
  /**
   * The order points were spent — present when the user added points in this
   * session or the URL carries a valid `?o=`. null when order info is absent
   * (old links without `?o=` show the build only).
   */
  order: readonly TalentOrderEntry[] | null;
  add: (tree: number, talent: number) => void;
  remove: (tree: number, talent: number) => void;
  setLevel: (level: number) => void;
  reset: () => void;
}

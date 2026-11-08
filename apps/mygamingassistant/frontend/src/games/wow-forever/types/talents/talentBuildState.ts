import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";

/** The calculator's build and level, kept in the URL, and what changes them. */
export interface TalentBuildState {
  build: TalentBuild;
  level: number;
  /** The lowest level the build's points allow (the level stepper's floor). */
  minLevel: number;
  /** The page was opened with a `?b=` this class can't have; the build started empty. */
  brokenLink: boolean;
  add: (tree: number, talent: number) => void;
  remove: (tree: number, talent: number) => void;
  setLevel: (level: number) => void;
  reset: () => void;
}

import type { Level } from "../tutor/level";
import type { LevelSaveOutcome } from "./level-save-outcome";

/** What ``useLevelChoice`` gives the level step. */
export interface LevelChoice {
  /** The language the level is for: the one just picked, else the saved one. Null when neither is known. */
  languageCode: string | null;
  /** The level picked on this visit, else the saved one. */
  selected: Level | null;
  pick: (level: Level) => void;
  /** The saved profile hasn't loaded yet. */
  isProfilePending: boolean;
  /** No saved profile, so this is the second onboarding step rather than "Change level". */
  isFirstTime: boolean;
  isSaving: boolean;
  isSaveError: boolean;
  /** Saves the language and level, resolving to how that ended. */
  save: () => Promise<LevelSaveOutcome>;
}

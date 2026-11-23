import type { Level } from "../tutor/level";
import type { LevelSaveFailure } from "./level-save-failure";
import type { LevelSaveOutcome } from "./level-save-outcome";

/** What ``useLevelChoice`` gives the level step. */
export interface LevelChoice {
  /** The language the level is for: the one just picked, else the saved one. Null when neither is known. */
  languageCode: string | null;
  /** The level picked on this visit, else the saved one. */
  selected: Level | null;
  pick: (level: Level) => void;
  /** Still loading what's needed to know the language: the saved profile, or the languages a chosen one is checked against. */
  isPending: boolean;
  /** The saved profile couldn't load and no language was chosen, so there is nothing to show but a way to retry. */
  loadFailed: boolean;
  retry: () => Promise<void>;
  /** A retry of the profile load is in flight. */
  isRetrying: boolean;
  /** No saved profile, so this is the second onboarding step rather than "Change level". */
  isFirstTime: boolean;
  isSaving: boolean;
  /** How the last save failed, while that's the latest word on it; null otherwise. */
  saveFailure: LevelSaveFailure | null;
  /** Saves the language and level, resolving to how that ended. */
  save: () => Promise<LevelSaveOutcome>;
}

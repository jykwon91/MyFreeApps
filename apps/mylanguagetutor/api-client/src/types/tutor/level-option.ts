import type { Level } from "./level";

/** One self-described starting point offered during onboarding. */
export interface LevelOption {
  value: Level;
  label: string;
  description: string;
}

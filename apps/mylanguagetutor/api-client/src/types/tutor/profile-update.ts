import type { Level } from "./level";

/** Body of ``PUT /profile``. */
export interface ProfileUpdate {
  language_code: string;
  level: Level;
}

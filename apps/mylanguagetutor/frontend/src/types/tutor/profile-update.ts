import type { Level } from "@/types/tutor/level";

/** Body of ``PUT /profile``. */
export interface ProfileUpdate {
  language_code: string;
  level: Level;
}

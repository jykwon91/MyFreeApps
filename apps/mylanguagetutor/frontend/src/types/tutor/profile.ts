import type { Level } from "@/types/tutor/level";

/** Mirrors backend ``ProfileResponse`` (app/schemas/tutor/profile_schemas.py). */
export interface Profile {
  language_code: string;
  level: Level;
  updated_at: string;
}

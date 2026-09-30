import type { Level } from "@/types/tutor/level";

/** Body of ``POST /sessions``. */
export interface SessionCreate {
  language_code: string;
  scenario_slug: string;
  level: Level;
}

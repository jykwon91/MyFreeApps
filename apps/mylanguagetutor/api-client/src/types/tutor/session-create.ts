import type { Level } from "./level";

/** Body of ``POST /sessions``. */
export interface SessionCreate {
  language_code: string;
  scenario_slug: string;
  level: Level;
}

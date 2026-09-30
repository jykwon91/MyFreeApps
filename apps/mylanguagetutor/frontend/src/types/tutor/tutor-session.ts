import type { Level } from "@/types/tutor/level";

/** Mirrors backend ``SessionSummary`` (app/schemas/tutor/session_schemas.py). */
export interface TutorSession {
  id: string;
  language_code: string;
  scenario_slug: string;
  level: Level;
  status: "active" | "ended";
  turn_count: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

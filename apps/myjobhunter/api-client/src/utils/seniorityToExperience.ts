import type { Experience } from "../types/discovery/experience";

/** A profile's seniority as JSearch's experience filter, or "" (any) when it doesn't map. */
export function seniorityToExperience(seniority: string | null): Experience {
  if (!seniority) return "";
  const s = seniority.toLowerCase();
  if (s.includes("senior") || s.includes("staff") || s.includes("principal") || s.includes("lead")) return "more_than_3_years_experience";
  if (s.includes("junior") || s.includes("entry")) return "no_experience";
  return s.includes("mid") ? "under_3_years_experience" : "";
}

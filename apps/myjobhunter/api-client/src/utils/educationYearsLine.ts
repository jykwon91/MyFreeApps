import type { Education } from "../types/education/education";

/** "2014 – 2018", either year alone, or null when neither is set. */
export function educationYearsLine({ start_year, end_year }: Pick<Education, "start_year" | "end_year">): string | null {
  return [start_year, end_year].filter(Boolean).join(" – ") || null;
}

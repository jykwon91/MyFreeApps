import type { Education } from "../types/education/education";

/** "B.S. in Computer Science", either half alone, or null when neither is set. */
export function educationDegreeLine({ degree, field }: Pick<Education, "degree" | "field">): string | null {
  return [degree, field].filter(Boolean).join(" in ") || null;
}

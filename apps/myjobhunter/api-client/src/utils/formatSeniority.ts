import { SENIORITY_OPTIONS } from "../constants/seniorityOptions";
import { humanizeKey } from "./humanizeKey";

/** "Senior level", or null when no level is set. A level this client doesn't know still reads sensibly ("Intern level"). */
export function formatSeniority(seniority: string | null): string | null {
  if (!seniority) return null;
  const label = SENIORITY_OPTIONS.find((option) => option.value === seniority)?.label ?? humanizeKey(seniority);
  return `${label} level`;
}

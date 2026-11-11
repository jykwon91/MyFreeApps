import { SENIORITY_OPTIONS } from "../constants/seniorityOptions";
import type { Seniority } from "../types/profile/seniority";

export function isSeniority(value: string | null | undefined): value is Seniority {
  return SENIORITY_OPTIONS.some((option) => option.value === value);
}

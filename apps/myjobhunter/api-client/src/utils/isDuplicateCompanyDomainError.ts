import { isConflict } from "./isConflict";

/** Whether POST /companies refused because another of your companies already has that domain. */
export function isDuplicateCompanyDomainError(error: unknown): boolean {
  return isConflict(error);
}

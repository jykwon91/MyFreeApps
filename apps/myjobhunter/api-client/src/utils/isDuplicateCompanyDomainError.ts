import { httpStatus } from "@platform/core/utils/httpStatus";

const CONFLICT = 409;

/** Whether POST /companies refused because another of your companies already has that domain. */
export function isDuplicateCompanyDomainError(error: unknown): boolean {
  return httpStatus(error) === CONFLICT;
}

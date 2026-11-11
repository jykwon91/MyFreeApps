import { httpStatus } from "@platform/core/utils/httpStatus";
import { HTTP_CONFLICT } from "../constants/httpConflict";

/** Whether the API refused because the record would repeat one that must be unique (a 409). */
export function isConflict(error: unknown): boolean {
  return httpStatus(error) === HTTP_CONFLICT;
}

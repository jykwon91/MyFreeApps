import type { WriteOutcome } from "@platform/core/types/write/write-outcome";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { isAxiosError } from "axios";

/** writeOutcome for a request sent with axios directly, which keeps the status and body under `response`. */
export function axiosWriteOutcome(error: unknown): WriteOutcome {
  return writeOutcome(isAxiosError(error) ? { status: error.response?.status, data: error.response?.data } : error);
}

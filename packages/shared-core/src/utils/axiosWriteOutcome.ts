import { isAxiosError } from "axios";
import type { WriteOutcome } from "../types/write/write-outcome";
import { writeOutcome } from "./writeOutcome";

/** writeOutcome for a request sent with axios directly, which keeps the status and body under `response`. */
export function axiosWriteOutcome(error: unknown): WriteOutcome {
  return writeOutcome(isAxiosError(error) ? { status: error.response?.status, data: error.response?.data } : error);
}

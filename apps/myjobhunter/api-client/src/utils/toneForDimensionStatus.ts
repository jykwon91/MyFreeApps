import { DIMENSION_STATUS_TONES } from "../constants/jobAnalysisDimensionStatusTones";
import type { StatusTone } from "../types/status-tone";

/** A dimension status's badge tone; neutral for a status this build doesn't know. */
export function toneForDimensionStatus(status: string): StatusTone {
  return Object.prototype.hasOwnProperty.call(DIMENSION_STATUS_TONES, status) ? DIMENSION_STATUS_TONES[status] : "neutral";
}

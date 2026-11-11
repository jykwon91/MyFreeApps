import { DIMENSION_STATUS_LABELS } from "../constants/jobAnalysisDimensionStatusLabels";

/** A dimension status's label, as in "Below target"; the raw status for one this build doesn't know. */
export function formatDimensionStatus(status: string): string {
  return Object.prototype.hasOwnProperty.call(DIMENSION_STATUS_LABELS, status) ? DIMENSION_STATUS_LABELS[status] : status;
}

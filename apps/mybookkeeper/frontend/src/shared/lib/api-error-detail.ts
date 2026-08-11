import type { ApiErrorDetailShape } from "@/shared/types/api/api-error-detail-shape";

/**
 * The backend's own explanation of a failure, or ``fallback`` when there is none.
 *
 * FastAPI validation errors put a list of per-field objects in `detail` rather
 * than a string; those are for developers, not operators, so only a plain
 * string is surfaced and anything else falls back.
 */
export function getApiErrorDetail(error: unknown, fallback: string): string {
  const detail = (error as ApiErrorDetailShape | undefined)?.data?.detail;
  return typeof detail === "string" && detail.trim() !== "" ? detail : fallback;
}

import type { ApiErrorDetailShape } from "@/shared/types/api/api-error-detail-shape";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";

const VALUE_ERROR_PREFIX = /^Value error,\s*/;

/**
 * Like getApiErrorDetail, but also reads FastAPI's 422 list shape
 * (`detail: [{ msg }]`), for a form field whose input the operator can fix.
 */
export function getApiValidationDetail(error: unknown, fallback: string): string {
  const detail = (error as ApiErrorDetailShape | undefined)?.data?.detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item as { msg?: unknown } | null)?.msg)
      .filter((msg): msg is string => typeof msg === "string" && msg.trim() !== "")
      .map((msg) => msg.replace(VALUE_ERROR_PREFIX, ""));
    return messages.length > 0 ? messages.join(" ") : fallback;
  }
  return getApiErrorDetail(error, fallback);
}

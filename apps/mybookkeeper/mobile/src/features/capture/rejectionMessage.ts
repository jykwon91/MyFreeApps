import type { ApiError } from "@platform/core/types/api-error";

export function rejectionMessage(fileName: string, error: ApiError): string {
  const data = error.data as { detail?: unknown } | undefined;
  const reason = typeof data?.detail === "string" ? data.detail : "The server wouldn't take it.";
  return `I couldn't send ${fileName}. ${reason}`;
}

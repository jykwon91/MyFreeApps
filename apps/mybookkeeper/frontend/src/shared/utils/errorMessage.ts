export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") {
      const data = obj.data as Record<string, unknown>;
      if (typeof data.detail === "string") return data.detail;
      // fastapi-users validation errors: { detail: { code: "...", reason: "..." } }
      if (data.detail && typeof data.detail === "object") {
        const detail = data.detail as Record<string, unknown>;
        if (typeof detail.reason === "string") return detail.reason;
      }
    }
    if (typeof obj.data === "string") return obj.data;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.error === "string") return obj.error;
  }
  return "An unexpected error occurred";
}

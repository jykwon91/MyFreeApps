const DEMO_DETAIL = "This feature is not available for demo accounts";

export function isDemoRefusal(error: unknown): boolean {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail === DEMO_DETAIL;
}

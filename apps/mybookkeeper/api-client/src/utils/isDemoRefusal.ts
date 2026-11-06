import { errorDetail } from "./errorDetail";

const DEMO_DETAIL = "This feature is not available for demo accounts";

export function isDemoRefusal(error: unknown): boolean {
  return errorDetail(error) === DEMO_DETAIL;
}

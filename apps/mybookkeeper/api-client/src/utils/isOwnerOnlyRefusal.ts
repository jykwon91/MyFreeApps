import { OWNER_ONLY_ADMIN_DETAILS } from "../constants/ownerOnlyRefusal";
import { errorDetail } from "./errorDetail";

export function isOwnerOnlyRefusal(error: unknown): boolean {
  const detail = errorDetail(error);
  return typeof detail === "string" && OWNER_ONLY_ADMIN_DETAILS.includes(detail);
}

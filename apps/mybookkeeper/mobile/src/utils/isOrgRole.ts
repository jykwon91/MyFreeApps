import { ROLE_LABELS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

/** For a role read back from somewhere unchecked, like a file on the phone. */
export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_LABELS, value);
}

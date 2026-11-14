import { ORGANIZATION_NAME_MAX_LENGTH } from "../constants/organizationName";
import type { OrganizationNameProblem } from "../types/organization/OrganizationNameProblem";

/** What's wrong with a typed name, judged as it will be sent: trimmed. Null when it can be sent. */
export function organizationNameProblem(name: string): OrganizationNameProblem | null {
  const trimmed = name.trim();
  if (trimmed === "") return "required";
  if (trimmed.length > ORGANIZATION_NAME_MAX_LENGTH) return "tooLong";
  return null;
}

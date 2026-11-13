import type { OrganizationNameProblem } from "../types/organization/OrganizationNameProblem";

/** `organizations.name` is a String(255), and the API takes any string, so the forms hold the line. */
export const ORGANIZATION_NAME_MAX_LENGTH = 255;

export const ORGANIZATION_NAME_PROBLEM_MESSAGES: Record<OrganizationNameProblem, string> = {
  required: "Enter a name.",
  tooLong: `Use ${ORGANIZATION_NAME_MAX_LENGTH} characters or fewer.`,
};

import { SENIORITY_OPTIONS } from "@myjobhunter/api-client/constants/seniorityOptions";

/** The About-you dialog's seniority select, led by a blank choice for "not set". */
export const SENIORITY_CHOICES = [{ value: "", label: "— not set —" }, ...SENIORITY_OPTIONS] as const;

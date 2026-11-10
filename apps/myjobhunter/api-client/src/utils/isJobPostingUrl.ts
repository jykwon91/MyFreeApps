import { JOB_URL_PATTERN } from "../constants/addApplicationForm";

/** True when the whole (trimmed) value is an http(s) link. */
export function isJobPostingUrl(value: string): boolean {
  return JOB_URL_PATTERN.test(value.trim());
}

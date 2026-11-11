import type { SeniorityOption } from "../types/profile/seniority-option";

/** Every level, junior to executive, for a picker. */
export const SENIORITY_OPTIONS: readonly SeniorityOption[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "exec", label: "Executive" },
];

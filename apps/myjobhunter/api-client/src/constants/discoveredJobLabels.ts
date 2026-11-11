/** How a discovered posting's card names its remote type. "unknown" has none. */
export const DISCOVERED_REMOTE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "",
};

/** A posting's salary when it states no currency. */
export const DEFAULT_SALARY_CURRENCY = "USD";

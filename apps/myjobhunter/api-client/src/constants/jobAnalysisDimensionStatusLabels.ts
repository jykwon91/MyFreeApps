/** Display copy per dimension status, e.g. "Strong" / "Below target" / "Compatible". */
export const DIMENSION_STATUS_LABELS: Record<string, string> = {
  // skill_match
  strong: "Strong",
  partial: "Partial",
  gap: "Gap",
  // seniority
  aligned: "Aligned",
  below: "Below",
  above: "Above",
  // salary
  above_target: "Above target",
  in_range: "In range",
  below_target: "Below target",
  not_disclosed: "Not disclosed",
  no_target: "No target set",
  // location_remote
  compatible: "Compatible",
  stretch: "Stretch",
  incompatible: "Incompatible",
  // work_auth (compatible / incompatible reused above)
  blocker: "Blocker",
  // shared
  unclear: "Unclear",
};

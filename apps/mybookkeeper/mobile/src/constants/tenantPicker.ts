export const TENANT_PICKER_LIMIT = 100;

export const TENANT_PICKER_MESSAGES = {
  title: "Who sent this?",
  thisTenant: "this tenant",
  loading: "I'm loading your tenants.",
  failed: "I couldn't load your tenants. Close this and try again.",
  none: "You don't have any tenants with a signed lease yet. Add one on the website, then come back.",
  more: "I'm showing the first 100. The rest are on the website.",
} as const;

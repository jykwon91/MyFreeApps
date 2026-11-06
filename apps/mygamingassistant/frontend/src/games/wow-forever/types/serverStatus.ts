/** WoW Forever server-status API types. */

export interface ServerRuleset {
  name: string;
  slug: string;
  online: boolean;
}

export interface ServerStatusResponse {
  region: string;
  checked_at: string;
  rulesets: ServerRuleset[];
}

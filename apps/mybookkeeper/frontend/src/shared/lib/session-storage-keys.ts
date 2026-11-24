/** localStorage keys for the signed-in session, shared by every tab. */
export const TOKEN_STORAGE_KEY = "token";
export const ACTIVE_ORG_STORAGE_KEY = "v1_activeOrgId";
/** The user the stored organization choice belongs to, written with it. */
export const ACTIVE_ORG_OWNER_STORAGE_KEY = "v1_activeOrgOwner";
/**
 * The Plaid Link session in progress, kept across the bank's OAuth redirect so
 * /plaid-oauth can resume the same Link. Cleared as soon as Link finishes.
 */
export const PLAID_LINK_SESSION_STORAGE_KEY = "v1_plaidLinkSession";

/** Where the active organization id lives. Synchronous, like `TokenStore`. */
export interface OrgStore {
  get(): string | null;
}

/**
 * Where the Security screen reads and saves the account's display name: useAccountDisplayName for the
 * shared `display_name` field, or an app's own hook when its backend names it differently.
 */
export interface DisplayNameSource {
  /** Undefined until the account has loaded. The form starts over when `accountId` changes. */
  account: { accountId: string; name: string } | undefined;
  /** The account couldn't be loaded, and there's nothing from before to show. */
  hasFailed: boolean;
  /** Reads the account again, rejecting if that fails. A successful read also renews the session. */
  reload: () => Promise<unknown>;
  /** Saves the trimmed name, rejecting if that fails. */
  save: (name: string) => Promise<unknown>;
  /** The longest name the backend accepts. */
  maxLength: number;
}

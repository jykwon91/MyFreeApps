import type { CurrentUser } from "@platform/core/types/user/current-user";

export interface DisplayNameSectionProps {
  /** Where the name shows, in this app's words. */
  description: string;
  /** Undefined until the account has loaded. */
  user: CurrentUser | undefined;
  /** The account couldn't be loaded, and there's nothing from before to show. */
  hasFailed: boolean;
  onRetry: () => Promise<void>;
}

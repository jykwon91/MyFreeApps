import type { OrgStore } from "./OrgStore";
import type { SessionRefreshResult } from "./SessionRefreshResult";
import type { TokenStore } from "./TokenStore";

/** Everything this package needs from the platform it runs on. */
export interface PlatformConfig {
  baseURL: string;
  tokenStore: TokenStore;
  orgStore: OrgStore;
  /** True while the login screen is showing, so a 401 there doesn't sign out. */
  isOnLogin: () => boolean;
  /**
   * Run `listener` when the app is going away, cancelling any open step-up
   * prompt. Returns a function that removes the listener. Leave it out on a
   * platform with no unload event.
   */
  onUnload?: (listener: () => void) => () => void;
  /**
   * Get a new access token when one is rejected, writing it to `tokenStore` before
   * resolving. Leave it out on a platform with no refresh token, where a rejected token
   * signs the user out. Never call this directly: use `refreshSessionOnce`.
   */
  refreshSession?: () => Promise<SessionRefreshResult>;
}

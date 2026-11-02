import type { OrgStore } from "./OrgStore";
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
   * prompt. Returns a function that removes the listener.
   */
  onUnload: (listener: () => void) => () => void;
}

import type { SessionRefreshResult, TokenStore } from "@platform/core";
import type { SessionState } from "./SessionState";
import type { SignInCredentials } from "./SignInCredentials";
import type { SignInResult } from "./SignInResult";

export interface MobileSession {
  /** Pass to `configurePlatform`, along with `refreshSession`. */
  tokenStore: TokenStore;
  refreshSession: () => Promise<SessionRefreshResult>;
  /** Pass to `configurePlatform` too. */
  currentAccount: () => string | null;
  /** Reads the stored session. Safe to call more than once. */
  start: () => Promise<void>;
  /** Reads the stored session again after it couldn't be read. */
  retryRestore: () => Promise<void>;
  getState: () => SessionState;
  subscribe: (listener: () => void) => () => void;
  signIn: (credentials: SignInCredentials) => Promise<SignInResult>;
  /** Always signs this phone out. `serverReached` is false if the server wasn't told. */
  signOut: () => Promise<{ serverReached: boolean }>;
  /** Stops waiting for an unreadable session, so the user can sign in over it. */
  skipRestore: () => void;
  dismissEndedNotice: () => void;
}

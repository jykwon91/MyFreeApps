import type { CurrentUser } from "@platform/core/types/user/current-user";
import type { ApiBaseOption } from "./ApiBaseOption";
import type { ShellRoute } from "./ShellRoute";
import type { UnmatchedAnswer } from "./UnmatchedAnswer";

export interface SignedInShellOptions<TUser extends object = CurrentUser> extends ApiBaseOption {
  /** What GET /users/me answers, in the app's own user shape; TEST_USER unless given. */
  user?: TUser;
  /**
   * The token to plant; unsignedJwt() unless given. A spec that pins the page's
   * clock passes one unexpired at that instant (unsignedJwt's `issuedAtMs`).
   */
  token?: string;
  /** Extra localStorage entries to plant beside the token, like an active workspace id. */
  storage?: Record<string, string>;
  /** Other reads every signed-in page of this app makes. */
  routes?: ShellRoute[];
  /** How calls nothing else answers are answered; "notFound" unless given. */
  unmatched?: UnmatchedAnswer;
}

export type AccountDeletion =
  /** The server said so. */
  | "confirmed"
  /** The answer was lost, then the server stopped accepting this session. */
  | "unconfirmed";

export type SessionState =
  /** The stored session hasn't been read yet. Not the same as signed out. */
  | { status: "restoring" }
  /** The phone wouldn't give up the stored session, e.g. it's still locked. It may be fine. */
  | { status: "unreadable" }
  | { status: "signedOut"; endedByServer: boolean; lastEmail: string | null; accountDeleted?: AccountDeletion }
  | { status: "signedIn"; email: string; sessionId: string };

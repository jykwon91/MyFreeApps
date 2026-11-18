import type { WriteFailure } from "@mybookkeeper/api-client/types/write/write-failure";

/**
 * How a `useWrite` run ended. "busy" when one was already in flight and nothing was sent; "cancelled"
 * when a cache reset (sign-out, account change, workspace switch) called it off, so there's nobody
 * left to tell; otherwise "done", or why it failed.
 */
export type WriteResult = WriteFailure | "done" | "busy" | "cancelled";

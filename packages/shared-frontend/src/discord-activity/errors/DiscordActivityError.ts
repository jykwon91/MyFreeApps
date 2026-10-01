import type { DiscordActivityErrorReason } from "../types/DiscordActivityErrorReason";

export interface DiscordActivityErrorOptions {
  /** Discord's RPC close/error code, when Discord sent one. */
  code?: number;
  /** The underlying failure (import error, SDK constructor error, ...). */
  cause?: unknown;
}

/**
 * Connecting to Discord failed. `reason` says which step failed so the UI and
 * the logs can tell "Discord never answered" from "the SDK didn't load".
 */
export class DiscordActivityError extends Error {
  readonly reason: DiscordActivityErrorReason;
  readonly code: number | null;
  readonly cause: unknown;

  constructor(reason: DiscordActivityErrorReason, message: string, options: DiscordActivityErrorOptions = {}) {
    super(message);
    this.name = "DiscordActivityError";
    this.reason = reason;
    this.code = options.code ?? null;
    this.cause = options.cause;
    Object.setPrototypeOf(this, DiscordActivityError.prototype);
  }
}

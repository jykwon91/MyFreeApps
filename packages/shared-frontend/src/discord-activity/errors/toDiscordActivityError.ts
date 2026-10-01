import { DiscordActivityError } from "./DiscordActivityError";

/** `error` as a {@link DiscordActivityError}; anything unexpected counts as an SDK start-up failure. */
export function toDiscordActivityError(error: unknown): DiscordActivityError {
  if (error instanceof DiscordActivityError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DiscordActivityError("sdk-init-failed", message, { cause: error });
}

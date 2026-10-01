import type { DiscordActivityError } from "../errors/DiscordActivityError";
import type { DiscordActivityStatus } from "./DiscordActivityStatus";

/** What `useDiscordActivity()` returns. */
export interface DiscordActivityState {
  /** True when the app runs as a Discord Activity (launched with `frame_id`). */
  inside: boolean;
  /** Connection progress; always `"ready"` outside Discord. */
  status: DiscordActivityStatus;
  /** Why connecting failed, when `status` is `"error"`. */
  error: DiscordActivityError | null;
  /** Start over (reloads the page — one SDK connection per page). */
  retry: () => void;
}

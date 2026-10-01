/**
 * Why connecting to Discord failed.
 *
 *  - `"not-in-discord"`: no Activity launch parameters (`frame_id`) on this page.
 *  - `"client-id-unavailable"`: the app couldn't fetch its Discord application id.
 *  - `"sdk-load-failed"`: the Embedded App SDK chunk didn't load.
 *  - `"sdk-init-failed"`: the SDK rejected the launch parameters.
 *  - `"closed-by-discord"`: Discord closed the RPC connection during the
 *    handshake (`code` carries the RPC close code, e.g. 4000 invalid client id).
 *  - `"ready-timeout"`: Discord never answered the handshake.
 */
export type DiscordActivityErrorReason =
  | "not-in-discord"
  | "client-id-unavailable"
  | "sdk-load-failed"
  | "sdk-init-failed"
  | "closed-by-discord"
  | "ready-timeout";

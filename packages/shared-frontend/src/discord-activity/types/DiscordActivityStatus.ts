/**
 * Where the Discord connection stands.
 *
 *  - `"loading"`: inside Discord, the Embedded App SDK handshake is running.
 *  - `"ready"`: connected — or not inside Discord at all (nothing to wait for).
 *  - `"error"`: inside Discord and the connection failed or timed out.
 */
export type DiscordActivityStatus = "loading" | "ready" | "error";

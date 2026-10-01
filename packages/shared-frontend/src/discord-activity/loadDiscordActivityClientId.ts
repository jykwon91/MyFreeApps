import api from "../lib/api";
import type { DiscordActivityConfig } from "./types/DiscordActivityConfig";

/**
 * The shared backend's public config route
 * (`platform_shared.api.discord_activity_router`), relative to the API base.
 */
export const DISCORD_ACTIVITY_CONFIG_PATH = "/discord/activity-config";

function isDiscordActivityConfig(value: unknown): value is DiscordActivityConfig {
  return typeof value === "object" && value !== null && "client_id" in value && typeof value.client_id === "string";
}

/**
 * Fetch the Discord application (client) id from the app's public config
 * endpoint — the usual `loadClientId` for `<DiscordActivityProvider>`.
 *
 * Rejects when the request fails (a 404 means the backend has Discord
 * switched off) or the answer isn't the expected shape — e.g. an HTML page
 * from a misrouted proxy. The provider reports either as "couldn't reach its
 * server".
 */
export async function loadDiscordActivityClientId(): Promise<string> {
  const { data } = await api.get<unknown>(DISCORD_ACTIVITY_CONFIG_PATH);
  if (!isDiscordActivityConfig(data)) {
    throw new Error(`Unexpected response from ${DISCORD_ACTIVITY_CONFIG_PATH}.`);
  }
  return data.client_id;
}

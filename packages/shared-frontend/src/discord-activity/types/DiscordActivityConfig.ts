/**
 * `GET /api/discord/activity-config` — the public Discord application (client)
 * id an Activity connects with. Mirrors the backend's
 * `platform_shared.schemas.discord_activity.DiscordActivityConfigResponse`;
 * change both together.
 */
export interface DiscordActivityConfig {
  client_id: string;
}

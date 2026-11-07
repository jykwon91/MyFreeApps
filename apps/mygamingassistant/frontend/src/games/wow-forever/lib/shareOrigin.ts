import { isDiscordActivity } from "@platform/ui/discord-activity";
import { MGA_SITE_URL } from "@/constants/discordActivity";

/**
 * Where a share link points. Inside the Discord Activity the page is served
 * from a discordsays.com origin that only works inside Discord, so links go to
 * the real site instead.
 */
export function shareOrigin(): string {
  return isDiscordActivity() ? MGA_SITE_URL : window.location.origin;
}

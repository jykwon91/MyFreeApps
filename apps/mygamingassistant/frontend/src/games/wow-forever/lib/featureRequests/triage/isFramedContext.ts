import { isDiscordActivity } from "@platform/ui/discord-activity";

/**
 * True inside the Discord Activity or any frame. The triage screen refuses to run there: a framing page
 * could overlay or read what the operator types. A cross-origin parent that throws counts as framed.
 */
export function isFramedContext(): boolean {
  if (isDiscordActivity()) return true;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

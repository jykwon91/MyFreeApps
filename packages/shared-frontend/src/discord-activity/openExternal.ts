import { getDiscordSdk } from "./initDiscordActivity";
import { isDiscordActivity } from "./launchParams";

function toHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// openExternalLink rejects with Discord's RPC error payload ({ code, message })
// or, before the connection exists, a plain Error.
function describeRpcError(error: unknown): { code: number | null; message: string } {
  if (typeof error !== "object" || error === null) return { code: null, message: String(error) };
  const code = "code" in error && typeof error.code === "number" ? error.code : null;
  const message = "message" in error && typeof error.message === "string" ? error.message : String(error);
  return { code, message };
}

/**
 * Open an absolute http(s) URL outside the app.
 *
 * Inside a Discord Activity the iframe sandbox blocks new tabs, so the URL
 * goes through the SDK's `openExternalLink` — Discord asks the user to
 * confirm (its "leaving Discord" prompt), and a "no" there is respected. If
 * Discord isn't connected or the command fails (logged with Discord's error
 * code), and everywhere outside Discord, it falls back to a new tab.
 * Anything that isn't an absolute http(s) URL is refused.
 */
export async function openExternal(url: string): Promise<void> {
  const target = toHttpUrl(url);
  if (target === null) {
    console.warn("[discord-activity] openExternal refused a URL that isn't absolute http(s): %s", url);
    return;
  }

  const client = isDiscordActivity() ? getDiscordSdk() : null;
  if (client !== null) {
    try {
      await client.commands.openExternalLink({ url: target });
      return;
    } catch (error) {
      const { code, message } = describeRpcError(error);
      console.warn("[discord-activity] openExternalLink failed: code=%s message=%s", code ?? "none", message);
    }
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

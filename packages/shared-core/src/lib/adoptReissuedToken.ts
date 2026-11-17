import type { AxiosResponse } from "axios";
import { TOKEN_REISSUING_URL_PARTS } from "../constants/sessionRefresh";
import { getPlatform } from "../platform/configurePlatform";
import { notifyAuthChange } from "./auth-store";
import type { SessionRetryConfig } from "./types/SessionRetryConfig";

/**
 * Keep the new token from a response that ended the one it was sent with. Done before the
 * caller sees the response, so nothing it does next, like refetching, sends the ended one.
 *
 * Only while the token sent is still the one in use: a sign-out or another sign-in since
 * is newer than this request.
 */
export function adoptReissuedToken(response: AxiosResponse): void {
  const config: SessionRetryConfig = response.config;
  const url = config.url ?? "";
  if (!TOKEN_REISSUING_URL_PARTS.some((part) => url.includes(part))) return;
  const token: unknown = (response.data as { access_token?: unknown } | null | undefined)?.access_token;
  const { tokenStore } = getPlatform();
  if (typeof token !== "string" || !token || config._sentToken !== tokenStore.get()) return;
  try {
    tokenStore.set(token);
  } catch {
    // The change went through, so its result, such as the recovery codes, must still show.
    // The ended token stays, and the next request signs the person out.
    return;
  }
  notifyAuthChange();
}

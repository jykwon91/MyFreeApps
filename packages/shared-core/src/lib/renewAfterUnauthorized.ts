import { RENEWAL_FOR_REFRESH } from "../constants/sessionRenewal";
import { getPlatform } from "../platform/configurePlatform";
import { isRefreshCoolingDown, refreshSessionOnce } from "./session-refresh";
import type { SentSession } from "./types/SentSession";
import type { SessionRenewal } from "./types/SessionRenewal";

/**
 * Whether a request refused with a 401 may be sent again, refreshing the sign-in if that's what it
 * needs. For the API client's own requests and for those a platform makes without it, such as a
 * streamed reply. Never "renewed" for someone who has signed in since the request was sent.
 */
export async function renewAfterUnauthorized({ token: sentToken, account: sentAccount }: SentSession): Promise<SessionRenewal> {
  const { tokenStore, currentAccount } = getPlatform();
  const token = tokenStore.get();
  // A request sent before the last refresh only needs the token that refresh got.
  if (token === null || token === sentToken) {
    if (isRefreshCoolingDown()) return "unreachable";
    const renewal = RENEWAL_FOR_REFRESH[await refreshSessionOnce()];
    if (renewal !== "renewed") return renewal;
  }
  if (currentAccount && currentAccount() !== sentAccount) return "ended";
  return "renewed";
}

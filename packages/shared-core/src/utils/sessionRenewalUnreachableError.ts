import { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { SESSION_RENEWAL_UNREACHABLE_MESSAGE } from "../constants/sessionRefresh";

/**
 * A request refused with a 401 that couldn't be retried because renewing the sign-in got no
 * answer. Nothing says the sign-in is over, so this reads like any request that got no response.
 */
export function sessionRenewalUnreachableError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(SESSION_RENEWAL_UNREACHABLE_MESSAGE, AxiosError.ERR_NETWORK, config);
}

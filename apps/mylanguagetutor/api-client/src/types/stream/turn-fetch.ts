import type { TurnFetchInit } from "./turn-fetch-init";
import type { TurnFetchResponse } from "./turn-fetch-response";

/** A streaming ``fetch``: web passes the browser's, the phone ``expo/fetch``. */
export type TurnFetch = (url: string, init: TurnFetchInit) => Promise<TurnFetchResponse>;

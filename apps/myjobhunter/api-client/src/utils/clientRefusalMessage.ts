import { httpStatus } from "@platform/core/utils/httpStatus";
import { serverDetail } from "./serverDetail";

/**
 * What to say when the server turned a request down (a 4xx): its own reason when it gave one, else `fallback`. A 5xx
 * is never put in its words: its detail can be an exception's text or a storage or provider message, not something to read out.
 */
export function clientRefusalMessage(error: unknown, fallback: string): string {
  const status = httpStatus(error);
  return typeof status === "number" && status < 500 ? (serverDetail(error) ?? fallback) : fallback;
}

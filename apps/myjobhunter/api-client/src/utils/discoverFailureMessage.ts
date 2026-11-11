import { serverDetail } from "./serverDetail";

/** What to say when a Discovery action fails: the server's reason when it gave one, else `fallback`. */
export function discoverFailureMessage(error: unknown, fallback: string): string {
  return serverDetail(error) ?? fallback;
}

import { serverDetail } from "./serverDetail";

/** What to say when the server refused a request: its own reason when it gave one, else `fallback`. */
export function serverFailureMessage(error: unknown, fallback: string): string {
  return serverDetail(error) ?? fallback;
}

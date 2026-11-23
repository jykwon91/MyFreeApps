import { isNotFound } from "@platform/core/utils/isNotFound";
import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { serverFailureMessage } from "./serverFailureMessage";

/**
 * What to say when a Discovery action fails: a plain line when what it acted on is gone (a 404, whose own text is a generic
 * "not found"), else the server's reason when it gave one, else `fallback`.
 */
export function discoverFailureMessage(error: unknown, fallback: string): string {
  if (isNotFound(error)) return DISCOVER_ACTION_MESSAGES.gone;
  return serverFailureMessage(error, fallback);
}

import { TURNSTILE_TOKEN_MAX_LENGTH } from "../constants/turnstile";
import type { TurnstileMessage } from "../types/TurnstileMessage";

/** Reads a message from the captcha page, or null for anything that isn't one of its messages. */
export function parseTurnstileMessage(data: string): TurnstileMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { type, token, code } = value as Record<string, unknown>;
  switch (type) {
    case "ready":
    case "expired":
      return { type };
    case "token":
      return typeof token === "string" && token !== "" && token.length <= TURNSTILE_TOKEN_MAX_LENGTH
        ? { type, token }
        : null;
    case "error":
      return { type, code: typeof code === "string" ? code : "unknown" };
    default:
      return null;
  }
}

import { BACK_LINK_APP_ROOT, BACK_LINK_LABEL_MAX_LENGTH } from "@/games/wow-forever/data/shared/backLinkConfig";
import type { BackLinkState } from "@/games/wow-forever/types/shared/backLinkState";

const APP_PATH = new RegExp(String.raw`^${BACK_LINK_APP_ROOT}([/?#][^\\\s]*)?$`);

/** A `.` / `..` path segment (plain or percent-encoded) could climb out of the app root once the browser resolves it. */
const DOT_SEGMENT = /(^|\/)(\.|%2e){1,2}(?=[/?#]|$)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads `location.state` as a back link, or null. Only a path inside the app is accepted, never a URL. */
export function parseBackLink(state: unknown): BackLinkState | null {
  if (!isRecord(state)) return null;
  const { backTo, backLabel } = state;
  if (typeof backTo !== "string" || typeof backLabel !== "string") return null;
  if (!APP_PATH.test(backTo) || DOT_SEGMENT.test(backTo.split(/[?#]/, 1)[0])) return null;
  if (backLabel.length === 0 || backLabel.length > BACK_LINK_LABEL_MAX_LENGTH) return null;
  return { backTo, backLabel };
}

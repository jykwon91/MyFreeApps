import type { HiddenCharSegment } from "@/games/wow-forever/types/featureRequests/triage/hiddenCharSegment";
import type { RevealedText } from "@/games/wow-forever/types/featureRequests/triage/revealedText";

/**
 * Zero-width and direction-changing characters a player could use to make text read differently from what
 * it is: U+200B–U+200F, U+202A–U+202E, U+2060, U+2066–U+2069, U+061C, U+FEFF.
 */
const HIDDEN_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\u061C\uFEFF]/g;

/** "U+200B" — four or more upper-case hex digits. */
function codePointName(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Splits untrusted text into plain runs and the hidden characters inside it, so each hidden one can be
 * shown as a visible `⟨U+XXXX⟩` marker instead of silently changing how the text reads. Pure.
 */
export function revealHiddenChars(text: string): RevealedText {
  const segments: HiddenCharSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(HIDDEN_CHARS)) {
    const index = match.index;
    if (index > last) segments.push({ kind: "text", text: text.slice(last, index) });
    segments.push({ kind: "hidden", codePoint: codePointName(match[0]) });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return { segments, hasHidden: segments.some((s) => s.kind === "hidden") };
}

/** How a hidden character reads on screen. */
export function hiddenCharMarker(codePoint: string): string {
  return `⟨${codePoint}⟩`;
}

import type { FocusLanding } from "../types/focus-landing";
import type { FocusLandingLevel } from "../types/focus-landing-level";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: Element): HTMLElement[] {
  const inside = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  return root instanceof HTMLElement && root.matches(FOCUSABLE) ? [root, ...inside] : inside;
}

export function captureFocusLanding(element: HTMLElement): FocusLanding {
  const levels: FocusLandingLevel[] = [];
  for (let level: HTMLElement | null = element; level && level !== document.body; level = level.parentElement) {
    levels.push({
      element: level,
      indexInLevel: focusablesIn(level).indexOf(element),
      next: level.nextElementSibling,
      previous: level.previousElementSibling,
    });
  }
  return { element, levels };
}

/**
 * After the captured element is removed, lists the matching control in the item that
 * followed, then the one that preceded, the removed one: removing a row's Archive button
 * lands on the next row's Archive button. Only items of the same tag count, so a "Load
 * more" button after a list of rows isn't taken for a row. Empty when no such item is left.
 */
export function findFocusLandings({ levels }: FocusLanding): HTMLElement[] {
  const removedAt = levels.findIndex(
    (level, i) => !level.element.isConnected && (i === levels.length - 1 || levels[i + 1].element.isConnected),
  );
  if (removedAt === -1) return [];
  const removed = levels[removedAt];
  const parent = removed.element === levels[levels.length - 1].element ? document.body : levels[removedAt + 1].element;
  const landings: HTMLElement[] = [];
  for (const neighbour of [removed.next, removed.previous]) {
    if (!neighbour?.isConnected || neighbour.parentElement !== parent) continue;
    if (neighbour.tagName !== removed.element.tagName) continue;
    const candidates = focusablesIn(neighbour);
    if (candidates.length > 0) landings.push(candidates[Math.min(removed.indexInLevel, candidates.length - 1)]);
  }
  return landings;
}

/**
 * useMapKeyboardShortcuts — global keyboard bindings for MapPage.
 *
 * Bindings:
 *   1           → set side to side_a
 *   2           → set side to side_b
 *   3           → set side to "any" (clears side param)
 *   q/w/e/r     → toggle utility chips by index (up to 4 utils; more ignored)
 *   p           → toggle round mode (?round=1)
 *   c           → toggle compact mode (?compact=1)
 *   f           → toggle fullscreen
 *   Esc         → close zone panel → exit round mode → nothing
 *   Arrow left  → cycle active card left (when panel open or in round mode)
 *   Arrow right → cycle active card right
 *   ?           → toggle keyboard shortcuts help overlay
 *
 * Guard: does NOT fire while focus is inside an input/textarea/select/contenteditable.
 */
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

interface UseMapKeyboardShortcutsOptions {
  /** Utility slugs in display order (first 4 bind to q/w/e/r). */
  utilOptions: Array<{ value: string; label: string }>;
  /** Currently selected utility slugs. */
  selectedUtils: string[];
  /** Current side param ("any" | "side_a" | "side_b"). */
  side: string;
  /** Current zone slug (empty string = no panel). */
  zone: string;
  /** Number of cards in the active view (for left/right cycling). */
  cardCount: number;
  /** Currently expanded card index (for round mode cycling). */
  activeCardIndex: number;
  onSideChange: (side: string) => void;
  onUtilToggle: (slugs: string[]) => void;
  onCloseZonePanel: () => void;
  onActiveCardIndexChange: (index: number) => void;
  onToggleShortcutsHelp: () => void;
}

function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  // document and window have no tagName; treat them as non-inputs
  if (!target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useMapKeyboardShortcuts({
  utilOptions,
  selectedUtils,
  side: _side,
  zone,
  cardCount,
  activeCardIndex,
  onSideChange,
  onUtilToggle,
  onCloseZonePanel,
  onActiveCardIndexChange,
  onToggleShortcutsHelp,
}: UseMapKeyboardShortcutsOptions): void {
  const [, setSearchParams] = useSearchParams();

  const toggleParam = useCallback(
    (param: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.get(param) === value) {
            next.delete(param);
          } else {
            next.set(param, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const removeParam = useCallback(
    (param: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(param);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInputTarget(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "1":
          onSideChange("side_a");
          break;
        case "2":
          onSideChange("side_b");
          break;
        case "3":
          onSideChange("any");
          break;

        // q/w/e/r → toggle utility by index (only first 4 bound)
        case "q":
        case "w":
        case "e":
        case "r": {
          const keyToIndex: Record<string, number> = { q: 0, w: 1, e: 2, r: 3 };
          const idx = keyToIndex[e.key];
          const util = utilOptions[idx];
          if (!util) break; // game has fewer than needed utilities
          const alreadySelected = selectedUtils.includes(util.value);
          const next = alreadySelected
            ? selectedUtils.filter((s) => s !== util.value)
            : [...selectedUtils, util.value];
          onUtilToggle(next);
          break;
        }

        case "p":
          toggleParam("round", "1");
          break;

        case "c":
          toggleParam("compact", "1");
          break;

        case "f":
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => undefined);
          } else {
            document.exitFullscreen().catch(() => undefined);
          }
          break;

        case "Escape":
          if (zone) {
            onCloseZonePanel();
          } else {
            removeParam("round");
          }
          break;

        case "ArrowLeft":
          if (cardCount > 0) {
            onActiveCardIndexChange(
              (activeCardIndex - 1 + cardCount) % cardCount,
            );
          }
          break;

        case "ArrowRight":
          if (cardCount > 0) {
            onActiveCardIndexChange((activeCardIndex + 1) % cardCount);
          }
          break;

        case "?":
          onToggleShortcutsHelp();
          break;

        default:
          return; // don't call preventDefault for unhandled keys
      }

      e.preventDefault();
    },
    [
      utilOptions,
      selectedUtils,
      zone,
      cardCount,
      activeCardIndex,
      onSideChange,
      onUtilToggle,
      onCloseZonePanel,
      onActiveCardIndexChange,
      onToggleShortcutsHelp,
      toggleParam,
      removeParam,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

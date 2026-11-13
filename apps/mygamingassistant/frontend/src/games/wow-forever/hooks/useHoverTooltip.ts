import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react-dom";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import {
  ITEM_TOOLTIP_FALLBACK_PLACEMENTS,
  ITEM_TOOLTIP_HIDE_GRACE_MS,
  ITEM_TOOLTIP_OFFSET_PX,
  ITEM_TOOLTIP_PLACEMENT,
  ITEM_TOOLTIP_SHOW_DELAY_MS,
  ITEM_TOOLTIP_VIEWPORT_PADDING_PX,
} from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import type { HoverTooltipFloatingProps } from "@/games/wow-forever/types/itemPages/hoverTooltipFloatingProps";

interface HoverTooltipOptions {
  /**
   * A tap (or Enter / Space) on the trigger toggles the tooltip, and a tap anywhere
   * else closes it — for triggers that do nothing else, like a provenance badge.
   * Off for links, where a tap must only navigate.
   */
  toggleOnTap?: boolean;
  /**
   * Caps the tooltip's height to the room the viewport leaves it, so a tall one
   * (an item beside the gear it is compared with) scrolls instead of running off screen.
   */
  fitToViewport?: boolean;
  /**
   * Makes it a non-modal popover (the content holds links): hover still opens it and the
   * pointer may cross onto it (spread `floatingProps`, give it `role="dialog"` and an
   * `aria-label`); Enter / Space on the trigger toggles it and moves focus into it; Escape
   * closes it and returns focus to the trigger; focus leaving it closes it. Keyboard focus
   * alone no longer opens it, and the trigger gets `aria-controls`, not `aria-describedby`.
   */
  interactive?: boolean;
}

/**
 * A tooltip on its trigger: a mouse hover shows it after a short delay, keyboard
 * focus at once; leaving, blur and Escape hide it. By default touch and mouse
 * clicks never open it, so a tap on the trigger does what it always did
 * (`toggleOnTap` changes that). Placed by Floating UI: above the trigger,
 * flipped below at the viewport edge, shifted to stay inside it.
 */
export function useHoverTooltip({ toggleOnTap = false, fitToViewport = false, interactive = false }: HoverTooltipOptions = {}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const lastPointerType = useRef("");
  const focusOnOpen = useRef(false);
  const tooltipId = useId();
  const [reference, setReference] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState<HTMLElement | null>(null);

  const { floatingStyles, isPositioned, placement } = useFloating({
    open,
    elements: { reference, floating },
    strategy: "fixed",
    placement: ITEM_TOOLTIP_PLACEMENT,
    middleware: [
      offset(ITEM_TOOLTIP_OFFSET_PX),
      flip({ fallbackPlacements: ITEM_TOOLTIP_FALLBACK_PLACEMENTS, padding: ITEM_TOOLTIP_VIEWPORT_PADDING_PX }),
      ...(fitToViewport
        ? [
            size({
              padding: ITEM_TOOLTIP_VIEWPORT_PADDING_PX,
              apply({ availableHeight, elements }) {
                elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
              },
            }),
          ]
        : []),
      shift({ padding: ITEM_TOOLTIP_VIEWPORT_PADDING_PX }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    cancelTimer();
    setOpen(false);
  }, [cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Focus that was inside the popover goes back to where it came from.
      if (interactive && floating?.contains(document.activeElement)) reference?.focus();
      hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, hide, interactive, floating, reference]);

  // A keyboard open moves focus into the popover, once Floating UI has placed it (a hidden element can't take focus).
  useEffect(() => {
    if (!open || !focusOnOpen.current || !floating || !isPositioned) return;
    focusOnOpen.current = false;
    floating.focus();
  }, [open, floating, isPositioned]);

  const focusInside = useCallback(() => floating?.contains(document.activeElement) ?? false, [floating]);

  useEffect(() => {
    if (!open || !toggleOnTap) return;
    function onOutsidePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      // A touch inside the tooltip (to scroll it) is not "elsewhere".
      if (target instanceof Node && (reference?.contains(target) || floating?.contains(target))) return;
      hide();
    }
    document.addEventListener("pointerdown", onOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", onOutsidePointerDown);
  }, [open, toggleOnTap, reference, floating, hide]);

  const onPointerEnter = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setOpen(true);
      }, ITEM_TOOLTIP_SHOW_DELAY_MS);
    },
    [cancelTimer],
  );

  // Give the pointer time to cross the gap between trigger and tooltip (same timer both ways: no flicker).
  const leaveWithGrace = useCallback(() => {
    // Someone using the keyboard inside the popover keeps it, wherever the mouse wanders.
    if (focusInside()) return;
    cancelTimer();
    timer.current = window.setTimeout(hide, ITEM_TOOLTIP_HIDE_GRACE_MS);
  }, [focusInside, cancelTimer, hide]);

  const onPointerLeave = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!interactive) {
        hide();
        return;
      }
      leaveWithGrace();
    },
    [hide, interactive, leaveWithGrace],
  );

  const floatingProps: HoverTooltipFloatingProps = interactive
    ? {
        tabIndex: -1,
        onPointerEnter: (event) => {
          if (event.pointerType === "mouse") cancelTimer();
        },
        onPointerLeave: (event) => {
          if (event.pointerType === "mouse") leaveWithGrace();
        },
        // Focus moving out of the popover (to anything but its trigger) closes it.
        onBlur: (event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && (floating?.contains(next) || reference?.contains(next))) return;
          hide();
        },
      }
    : {};

  const onFocus = useCallback(
    (event: FocusEvent) => {
      // The browser's own "focused from the keyboard" test: a click or a tap doesn't match it.
      if (interactive || !event.currentTarget.matches(":focus-visible")) return;
      cancelTimer();
      setOpen(true);
    },
    [cancelTimer, interactive],
  );

  // Pressing the mouse on a link in the popover blurs the trigger first; that must not close it.
  const onBlur = useCallback(
    (event: FocusEvent) => {
      if (interactive && event.relatedTarget instanceof Node && floating?.contains(event.relatedTarget)) return;
      hide();
    },
    [interactive, floating, hide],
  );

  const onPointerDown = useCallback((event: PointerEvent) => {
    lastPointerType.current = event.pointerType;
  }, []);

  const onClick = useCallback(() => {
    cancelTimer();
    // A mouse click on a hovered trigger keeps it open; a tap or a key press toggles it.
    if (lastPointerType.current === "mouse") setOpen(true);
    else setOpen((wasOpen) => !wasOpen);
    // A key press (no pointer went down first) opens the popover with focus inside it.
    if (interactive && lastPointerType.current === "" && !open) focusOnOpen.current = true;
    lastPointerType.current = "";
  }, [cancelTimer, interactive, open]);

  const hoverProps = {
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    "aria-describedby": open && !interactive ? tooltipId : undefined,
    "aria-controls": open && interactive ? tooltipId : undefined,
  };
  const triggerProps = toggleOnTap ? { ...hoverProps, onPointerDown, onClick } : hoverProps;

  return { open, tooltipId, triggerProps, floatingProps, setReference, setFloating, floatingStyles, isPositioned, placement };
}

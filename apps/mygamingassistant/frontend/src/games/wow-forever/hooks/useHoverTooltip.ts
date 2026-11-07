import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import {
  ITEM_TOOLTIP_FALLBACK_PLACEMENTS,
  ITEM_TOOLTIP_OFFSET_PX,
  ITEM_TOOLTIP_PLACEMENT,
  ITEM_TOOLTIP_SHOW_DELAY_MS,
  ITEM_TOOLTIP_VIEWPORT_PADDING_PX,
} from "@/games/wow-forever/data/itemPages/itemTooltipConfig";

interface HoverTooltipOptions {
  /**
   * A tap (or Enter / Space) on the trigger toggles the tooltip, and a tap anywhere
   * else closes it — for triggers that do nothing else, like a provenance badge.
   * Off for links, where a tap must only navigate.
   */
  toggleOnTap?: boolean;
}

/**
 * A tooltip on its trigger: a mouse hover shows it after a short delay, keyboard
 * focus at once; leaving, blur and Escape hide it. By default touch and mouse
 * clicks never open it, so a tap on the trigger does what it always did
 * (`toggleOnTap` changes that). Placed by Floating UI: above the trigger,
 * flipped below at the viewport edge, shifted to stay inside it.
 */
export function useHoverTooltip({ toggleOnTap = false }: HoverTooltipOptions = {}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const lastPointerType = useRef("");
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
      if (event.key === "Escape") hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, hide]);

  useEffect(() => {
    if (!open || !toggleOnTap) return;
    function onOutsidePointerDown(event: globalThis.PointerEvent) {
      if (reference && event.target instanceof Node && reference.contains(event.target)) return;
      hide();
    }
    document.addEventListener("pointerdown", onOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", onOutsidePointerDown);
  }, [open, toggleOnTap, reference, hide]);

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

  const onPointerLeave = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "mouse") hide();
    },
    [hide],
  );

  const onFocus = useCallback(
    (event: FocusEvent) => {
      // The browser's own "focused from the keyboard" test: a click or a tap doesn't match it.
      if (!event.currentTarget.matches(":focus-visible")) return;
      cancelTimer();
      setOpen(true);
    },
    [cancelTimer],
  );

  const onPointerDown = useCallback((event: PointerEvent) => {
    lastPointerType.current = event.pointerType;
  }, []);

  const onClick = useCallback(() => {
    cancelTimer();
    // A mouse click on a hovered trigger keeps it open; a tap or a key press toggles it.
    if (lastPointerType.current === "mouse") setOpen(true);
    else setOpen((wasOpen) => !wasOpen);
    lastPointerType.current = "";
  }, [cancelTimer]);

  const hoverProps = { onPointerEnter, onPointerLeave, onFocus, onBlur: hide, "aria-describedby": open ? tooltipId : undefined };
  const triggerProps = toggleOnTap ? { ...hoverProps, onPointerDown, onClick } : hoverProps;

  return { open, tooltipId, triggerProps, setReference, setFloating, floatingStyles, isPositioned, placement };
}

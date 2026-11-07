import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { LONG_PRESS_FEEDBACK_MS, LONG_PRESS_MS, TOUCH_CONTEXT_MENU_WINDOW_MS } from "@/games/wow-forever/data/worldMap/mapMarks";
import type { MapMenuTarget } from "@/games/wow-forever/types/mapMarks/mapMenuTarget";
import type { PressRing } from "@/games/wow-forever/types/mapMarks/pressRing";

/** A finger that moves this far (px) is panning or scrolling, not pressing. */
const PRESS_SLOP = 6;
/** A `contextmenu` this soon after our own key opened the menu is the same key press. */
const KEY_MENU_WINDOW_MS = 500;
/** While a finger is down, contextmenu is the browser's long-press — for at most this long. */
const TOUCH_HOLD_MAX_MS = 5000;

interface PressStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export interface MapPressMenu {
  /** The ring filling under a held finger (null = no press under way). */
  ring: PressRing | null;
  /** Every primary-button pointer down on the map; `fingers` = pointers now down, this one included. */
  down: (e: PointerEvent<HTMLElement>, fingers: number) => void;
  move: (e: PointerEvent<HTMLElement>) => void;
  /** A pointer lifted or cancelled; true = it ended a long-press, so it must not count as a click. */
  end: (e: PointerEvent<HTMLElement>) => boolean;
  contextMenu: (e: MouseEvent<HTMLElement>) => void;
  /** Shift+F10 / the menu key on the focused map: the menu at the middle of the view. */
  keyMenu: () => void;
}

/**
 * The map's menu gesture: right-click with a mouse, a ~half-second press
 * with a finger, the menu key on a keyboard. A press is called off by any
 * drag (the finger moved), a second finger (a pinch) or the page taking the
 * gesture (a scroll), so it never fights panning or zooming. The browser's
 * own long-press `contextmenu` (Android) is swallowed — ours already fired.
 */
export function useMapPressMenu(
  boxRef: RefObject<HTMLElement | null>,
  pictureRef: RefObject<Element | null>,
  onMenu: (target: MapMenuTarget) => void,
): MapPressMenu {
  const [ring, setRing] = useState<PressRing | null>(null);
  const start = useRef<PressStart | null>(null);
  const timers = useRef<number[]>([]);
  const fired = useRef(false);
  // A contextmenu before this time comes from a finger (held, or lifted moments ago): the browser's long-press.
  const touchUntil = useRef(0);
  const keyMenuAt = useRef(0);

  const targetAt = useCallback(
    (clientX: number, clientY: number): MapMenuTarget | null => {
      const box = boxRef.current?.getBoundingClientRect();
      const picture = pictureRef.current?.getBoundingClientRect();
      if (!box || !picture || picture.width === 0 || picture.height === 0) return null;
      return {
        x: Math.min(100, Math.max(0, ((clientX - picture.left) / picture.width) * 100)),
        y: Math.min(100, Math.max(0, ((clientY - picture.top) / picture.height) * 100)),
        boxX: clientX - box.left,
        boxY: clientY - box.top,
        boxWidth: box.width,
        boxHeight: box.height,
      };
    },
    [boxRef, pictureRef],
  );

  const open = useCallback(
    (clientX: number, clientY: number) => {
      const target = targetAt(clientX, clientY);
      if (target) onMenu(target);
    },
    [targetAt, onMenu],
  );

  const cancel = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    start.current = null;
    setRing(null);
  }, []);

  useEffect(() => cancel, [cancel]);

  function down(e: PointerEvent<HTMLElement>, fingers: number) {
    if (e.pointerType !== "touch") return;
    // Not Infinity: a lift we never hear about (the finger left the map) mustn't block right-click for good.
    touchUntil.current = Date.now() + TOUCH_HOLD_MAX_MS;
    if (fingers > 1) {
      cancel();
      return;
    }
    cancel();
    fired.current = false;
    const press: PressStart = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    start.current = press;
    const box = boxRef.current?.getBoundingClientRect();
    timers.current = [
      window.setTimeout(() => {
        if (box) setRing({ boxX: press.clientX - box.left, boxY: press.clientY - box.top });
      }, LONG_PRESS_FEEDBACK_MS),
      window.setTimeout(() => {
        cancel();
        fired.current = true;
        navigator.vibrate?.(10);
        open(press.clientX, press.clientY);
      }, LONG_PRESS_MS),
    ];
  }

  function move(e: PointerEvent<HTMLElement>) {
    const press = start.current;
    if (!press || press.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY) > PRESS_SLOP) cancel();
  }

  function end(e: PointerEvent<HTMLElement>): boolean {
    if (e.pointerType === "touch") touchUntil.current = Date.now() + TOUCH_CONTEXT_MENU_WINDOW_MS;
    if (start.current?.pointerId === e.pointerId) cancel();
    const longPress = fired.current;
    fired.current = false;
    return longPress;
  }

  function contextMenu(e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    const now = Date.now();
    if (now < touchUntil.current || now - keyMenuAt.current < KEY_MENU_WINDOW_MS) return;
    open(e.clientX, e.clientY);
  }

  function keyMenu() {
    keyMenuAt.current = Date.now();
    const box = boxRef.current?.getBoundingClientRect();
    if (box) open(box.left + box.width / 2, box.top + box.height / 2);
  }

  return { ring, down, move, end, contextMenu, keyMenu };
}

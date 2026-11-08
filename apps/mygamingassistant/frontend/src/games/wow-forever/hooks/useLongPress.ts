import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { TALENT_LONG_PRESS_MS, TALENT_LONG_PRESS_SLOP_PX } from "@/games/wow-forever/data/talents/talentConfig";

/**
 * A long press with a finger or pen (`TALENT_LONG_PRESS_MS`) — the touch
 * stand-in for right-click. Moving more than a few pixels is a scroll and
 * cancels it. After it fires, `consumeLongPress()` returns true once, so the
 * click the browser sends when the finger lifts can be ignored.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      cancel();
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, TALENT_LONG_PRESS_MS);
    },
    [cancel, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!start.current) return;
      const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
      if (moved > TALENT_LONG_PRESS_SLOP_PX) cancel();
    },
    [cancel],
  );

  const consumeLongPress = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return {
    pressProps: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel },
    consumeLongPress,
  };
}

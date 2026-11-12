import { useCallback, useEffect, useRef, useState } from "react";
import { KEEP_AWAKE_IDLE_MS } from "../constants/conversation";
import type { AwakeUntilIdle } from "../types/AwakeUntilIdle";

/**
 * Keeps the screen awake while a turn is in flight and for an idle period after it, or after the
 * learner's last activity (typing, scrolling), so a conversation left open doesn't hold the screen
 * on for good. Activity only notes the time: the screen re-renders when awake turns to idle and back,
 * not on every scroll event.
 */
export function useAwakeUntilIdle(busy: boolean): AwakeUntilIdle {
  const [idle, setIdle] = useState(false);
  const isIdle = useRef(false);
  const lastActivity = useRef(0);
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    setIdle(false);
  }

  useEffect(() => {
    isIdle.current = idle;
  }, [idle]);

  // Runs when the idle period starts over: on mount, when a turn ends, and on waking up.
  useEffect(() => {
    if (busy || idle) return;
    lastActivity.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const left = lastActivity.current + KEEP_AWAKE_IDLE_MS - Date.now();
      if (left <= 0) setIdle(true);
      else timer = setTimeout(check, left);
    };
    timer = setTimeout(check, KEEP_AWAKE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [busy, idle]);

  const onActivity = useCallback(() => {
    lastActivity.current = Date.now();
    if (isIdle.current) setIdle(false);
  }, []);

  return { awake: busy || !idle, onActivity };
}

/**
 * useCvDebugFrame — subscribe to `cv:debug-frame` events for live tuning.
 *
 * Lifecycle:
 *   1. On mount under Tauri, call `cv_subscribe_debug_frames` so the
 *      pipeline starts encoding PNGs.
 *   2. Attach a `listen('cv:debug-frame', ...)` handler that updates state.
 *   3. On unmount, detach the listener AND call `cv_unsubscribe_debug_frames`
 *      so the pipeline stops encoding (subscriber count drops to 0).
 *
 * Web build: returns null + ready=true with no listener traffic. Same shape
 * as `useCvState`.
 */
import { useEffect, useState } from "react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type { CvDebugFrameEvent } from "@/types/desktop";

const EVENT_DEBUG_FRAME = "cv:debug-frame";

export interface UseCvDebugFrameResult {
  /** Most recent debug frame, or null. */
  frame: CvDebugFrameEvent | null;
  /** True after the hook has wired its subscription. */
  ready: boolean;
  /** Seconds since the last frame arrived. -1 when no frames yet. */
  secondsSinceLast: number;
}

export function useCvDebugFrame(): UseCvDebugFrameResult {
  const [frame, setFrame] = useState<CvDebugFrameEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keep `now` ticking so `secondsSinceLast` updates in the UI. 1Hz is fine —
  // the displayed value is meant for diagnosis, not animation.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => setReady(true);
      channel.port2.postMessage(null);
      return () => channel.port1.close();
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function subscribe() {
      try {
        await invokeTauri<void>("cv_subscribe_debug_frames");
      } catch {
        // Pipeline not registered (Mac/Linux). Stay disabled.
      }
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<CvDebugFrameEvent>(EVENT_DEBUG_FRAME, (e) => {
        if (cancelled) return;
        setFrame(e.payload);
        setLastAt(Date.now());
      });
      if (!cancelled) setReady(true);
    }

    void subscribe();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      // Fire-and-forget — we don't await this in cleanup. If the IPC fails,
      // the worst case is the pipeline keeps encoding for one more
      // subscriber-count tick than necessary.
      void invokeTauri<void>("cv_unsubscribe_debug_frames").catch(() => undefined);
    };
  }, []);

  const secondsSinceLast =
    lastAt === null ? -1 : Math.max(0, Math.floor((now - lastAt) / 1000));

  return { frame, ready, secondsSinceLast };
}

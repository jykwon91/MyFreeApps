/**
 * CS2 GSI client — runtime hook used by Live mode and Setup pages.
 *
 * The Rust receiver (PR 8) emits two Tauri events:
 *
 *   - `gsi:state-update`   — `GsiEvent` payload, fired on every accepted POST.
 *   - `gsi:server-status`  — `GsiServerStatus` snapshot, fired on startup +
 *                            after every accepted POST.
 *
 * `useGsiState` subscribes to both, holds the latest in React state, and
 * returns them via a small accessor. Web-build callers get `null` state
 * back — gating UI on `isTauri()` is the caller's responsibility, but the
 * hook degrades safely so dropping it into a shared component doesn't
 * crash the web bundle.
 *
 * Subscription lifecycle:
 *   - On mount, dynamically import `@tauri-apps/api/event` and call
 *     `listen()` for both event names.
 *   - On unmount, invoke the returned unlisten functions.
 *
 * Polling fallback:
 *   - For the initial render before any event has arrived, we also call
 *     `gsi_server_status` once via IPC so the UI knows whether the
 *     receiver is bound. This is a single one-shot call, not a poll loop.
 */
import { useEffect, useState } from "react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type { GsiEvent, GsiServerStatus } from "@/types/desktop";

/** Event name emitted by the Rust receiver on every accepted POST. */
const EVENT_STATE_UPDATE = "gsi:state-update";
/** Event name emitted on startup and on every accepted POST. */
const EVENT_SERVER_STATUS = "gsi:server-status";

export interface UseGsiStateResult {
  /**
   * Latest GSI event parsed from a CS2 POST. `null` when:
   *   - We're not running under Tauri (web build).
   *   - CS2 hasn't posted yet (initial state).
   */
  event: GsiEvent | null;
  /**
   * Latest server-status snapshot. `null` until the first event or status
   * push arrives. The setup UI uses this to render "Connected" /
   * "Waiting for CS2" / "Receiver not bound" states.
   */
  status: GsiServerStatus | null;
  /**
   * `true` once the hook has finished its initial wiring (event listeners
   * registered + first status fetched). The UI can show a brief skeleton
   * until this flips.
   */
  ready: boolean;
}

export function useGsiState(): UseGsiStateResult {
  const [event, setEvent] = useState<GsiEvent | null>(null);
  const [status, setStatus] = useState<GsiServerStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      // Web build — degrade to "always ready, no events". Defer the
      // setState via MessageChannel so React's "no setState in an effect
      // body" rule stays happy (same pattern as usePins/useLoadout).
      const channel = new MessageChannel();
      channel.port1.onmessage = () => setReady(true);
      channel.port2.postMessage(null);
      return () => channel.port1.close();
    }

    let cancelled = false;
    let unlistenStateUpdate: (() => void) | null = null;
    let unlistenServerStatus: (() => void) | null = null;

    async function subscribe() {
      // Dynamic-import the events API so the web bundle doesn't pull it in.
      // Same pattern as `invokeTauri` in `lib/tauri.ts`.
      const { listen } = await import("@tauri-apps/api/event");

      unlistenStateUpdate = await listen<GsiEvent>(
        EVENT_STATE_UPDATE,
        (e) => {
          if (cancelled) return;
          setEvent(e.payload);
        },
      );

      unlistenServerStatus = await listen<GsiServerStatus>(
        EVENT_SERVER_STATUS,
        (e) => {
          if (cancelled) return;
          setStatus(e.payload);
        },
      );

      // One-shot bootstrap — fetch the current status immediately so we
      // don't render "Waiting for CS2" while the receiver may already be
      // running and just hasn't pushed yet.
      try {
        const initialStatus = await invokeTauri<GsiServerStatus>(
          "gsi_server_status",
        );
        if (!cancelled) setStatus(initialStatus);
      } catch {
        // Receiver not running yet — leave status null. The next pushed
        // event will fill it in.
      }

      if (!cancelled) setReady(true);
    }

    void subscribe();

    return () => {
      cancelled = true;
      if (unlistenStateUpdate) unlistenStateUpdate();
      if (unlistenServerStatus) unlistenServerStatus();
    };
  }, []);

  return { event, status, ready };
}

/**
 * Decide what to display in the Live mode top bar based on the most recent
 * GSI event. Pure function — easy to unit test, easy to reuse from the
 * Live mode page header and any future overlay surface.
 *
 * Returns `null` when there's no meaningful event yet (i.e., we should
 * render the "Waiting for CS2" empty state).
 */
export interface LiveBarFields {
  /** Display-formatted map name (capitalized slug). */
  mapDisplay: string;
  /** Display-formatted side ("T" / "CT" / "—"). */
  sideDisplay: string;
  /** Display-formatted map phase ("Live", "Warmup", "Halftime", "Game over"). */
  phaseDisplay: string;
}

const MAP_PHASE_LABELS: Record<string, string> = {
  warmup: "Warmup",
  live: "Live",
  intermission: "Halftime",
  gameover: "Game over",
};

const SIDE_LABELS_CS2: Record<string, string> = {
  side_a: "T",
  side_b: "CT",
  any: "—",
};

export function summarizeLiveBar(event: GsiEvent | null): LiveBarFields | null {
  if (!event) return null;
  if (!event.map_slug && !event.map_phase) return null;
  const mapDisplay = event.map_slug
    ? event.map_slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
  return {
    mapDisplay,
    sideDisplay: SIDE_LABELS_CS2[event.side] ?? "—",
    phaseDisplay: MAP_PHASE_LABELS[event.map_phase] ?? event.map_phase ?? "—",
  };
}

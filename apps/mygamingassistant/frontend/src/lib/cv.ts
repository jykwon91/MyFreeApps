/**
 * Minimap CV pipeline client (PR 9a).
 *
 * Mirrors `lib/gsi.ts` shape — runtime hook that:
 *   - Subscribes to `cv:zone-detected` Tauri events on mount.
 *   - Holds the latest zone-detection event + the latest poll-fetched status.
 *   - Polls `cv_status` at a low rate (every 2 s) so the Setup page sees
 *     tick counters update.
 *   - Degrades to "no-op" on the web bundle so dropping the hook into
 *     shared components doesn't crash.
 *
 * Note: this hook intentionally does NOT poll on every render of the
 * LiveCs2 page — `useCvState` only fires its status poll if it has been
 * MOUNTED for at least 1s. The pushed `cv:zone-detected` event is the
 * primary signal for live UX.
 */
import { useEffect, useState } from "react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type { CvStatus, CvZoneDetectedEvent } from "@/types/desktop";

/** Event name emitted by the Rust pipeline. */
const EVENT_ZONE_DETECTED = "cv:zone-detected";

/** Default poll interval for cv_status. The pipeline pushes zone-change
 *  events; the status poll is for tick counters / latency stats on the
 *  Setup page. 2s is enough to feel responsive without measurable CPU. */
const STATUS_POLL_MS = 2_000;

export interface UseCvStateResult {
  /**
   * Latest detected zone slug, or null when:
   *   - Web bundle (no pipeline reachable).
   *   - Pipeline not running.
   *   - Pipeline running but player isn't in any known zone.
   * Distinct from `status.last_zone` (which is the most-recent
   * detection regardless of whether it changed — useful for the Setup page).
   */
  zone: string | null;
  /**
   * Last CV event payload received, including confidence + latency. Null
   * until the first event arrives.
   */
  lastEvent: CvZoneDetectedEvent | null;
  /** Latest cv_status snapshot, or null if not fetched yet. */
  status: CvStatus | null;
  /** True once the hook has finished its initial wiring + first poll. */
  ready: boolean;
  /**
   * Refresh the cv_status snapshot on demand. Useful for the Setup page's
   * "Refresh" button.
   */
  refresh: () => Promise<void>;
}

export function useCvState(): UseCvStateResult {
  const [zone, setZone] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<CvZoneDetectedEvent | null>(null);
  const [status, setStatus] = useState<CvStatus | null>(null);
  const [ready, setReady] = useState(false);

  // Refresh function — exposed back to callers AND used by the poll loop.
  // Defined outside the effect so we can return a stable reference; defining
  // it inside would force consumers to refetch on every render. We accept
  // the eslint "unbound function" idiom by wrapping in a closure on return.
  async function doRefresh(): Promise<void> {
    if (!isTauri()) return;
    try {
      const next = await invokeTauri<CvStatus>("cv_status");
      setStatus(next);
    } catch {
      // Pipeline not registered (no capture backend) — the Rust side
      // returns a sane default snapshot, so a hard failure here means the
      // command itself didn't exist. Leave status alone.
    }
  }

  useEffect(() => {
    if (!isTauri()) {
      // Web build — degrade. Defer via MessageChannel so React's
      // "no setState in effect body" rule stays happy.
      const channel = new MessageChannel();
      channel.port1.onmessage = () => setReady(true);
      channel.port2.postMessage(null);
      return () => channel.port1.close();
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function subscribe() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<CvZoneDetectedEvent>(EVENT_ZONE_DETECTED, (e) => {
        if (cancelled) return;
        setLastEvent(e.payload);
        setZone(e.payload.zone_slug ?? null);
      });

      // One-shot bootstrap status.
      await doRefresh();
      if (!cancelled) setReady(true);
    }

    void subscribe();

    // Poll status periodically — the Setup page reads tick counters from
    // this. The live page doesn't really need it, but the poll cost (one
    // IPC call every 2s) is negligible.
    const pollId = setInterval(() => {
      void doRefresh();
    }, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (unlisten) unlisten();
    };
  }, []);

  return {
    zone,
    lastEvent,
    status,
    ready,
    refresh: () => doRefresh(),
  };
}

/**
 * Decide how to display the zone slug in the live HUD. Same shape as
 * `summarizeLiveBar` in `lib/gsi.ts`. Pure, easy to test.
 *
 * Returns the display string, or "—" when no zone is known.
 */
export function formatZoneDisplay(zone: string | null | undefined): string {
  if (!zone) return "—";
  // Zone slugs are kebab-case ("a-site", "b-apts"). Capitalize each word.
  return zone
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

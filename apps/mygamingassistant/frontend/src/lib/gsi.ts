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
import type { Cs2UtilitySlug, GsiEvent, GsiServerStatus } from "@/types/desktop";

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
 *
 * PR 10 extends the shape to include money / score / bomb state / round
 * phase. None of the new fields cause the helper to return non-null
 * on their own — the existence-check on map_slug / map_phase is still
 * the "is there anything meaningful to show" signal.
 */
export interface LiveBarFields {
  /** Display-formatted map name (capitalized slug). */
  mapDisplay: string;
  /** Display-formatted side ("T" / "CT" / "—"). */
  sideDisplay: string;
  /** Display-formatted map phase ("Live", "Warmup", "Halftime", "Game over"). */
  phaseDisplay: string;
  /**
   * Round phase chip text ("Freezetime", "Live", "Over"), or null when
   * unset / unknown. Distinct from `phaseDisplay` which is the MAP phase.
   */
  roundPhaseDisplay: string | null;
  /**
   * "12-8" formatted score (CT-first, T-second per CS2 scoreboard
   * convention), or null when scores aren't available yet.
   */
  scoreDisplay: string | null;
  /**
   * "$4150" formatted money. Null when CS2 hasn't sent money yet.
   */
  moneyDisplay: string | null;
  /**
   * "+kit" / "+$250 kit" suffix shown next to money when armor+helmet OR
   * defuse-kit are present. Empty string when nothing extra to surface.
   */
  equipExtra: string;
  /**
   * "💣 planted" / "defused" / "exploded" chip text, or null when the
   * bomb hasn't been touched this round.
   */
  bombDisplay: string | null;
}

const MAP_PHASE_LABELS: Record<string, string> = {
  warmup: "Warmup",
  live: "Live",
  intermission: "Halftime",
  gameover: "Game over",
};

const ROUND_PHASE_LABELS: Record<string, string> = {
  freezetime: "Freezetime",
  live: "Live",
  over: "Over",
};

const BOMB_STATE_LABELS: Record<string, string> = {
  planted: "💣 planted",
  defused: "defused",
  exploded: "exploded",
};

const SIDE_LABELS_CS2: Record<string, string> = {
  side_a: "T",
  side_b: "CT",
  any: "—",
};

function formatMoney(money: number | null | undefined): string | null {
  if (money === null || money === undefined) return null;
  return `$${money.toLocaleString("en-US")}`;
}

function formatScore(
  ctScore: number | null | undefined,
  tScore: number | null | undefined,
): string | null {
  // We require BOTH scores to render — half-shown scores would be more
  // confusing than no score.
  if (ctScore === null || ctScore === undefined) return null;
  if (tScore === null || tScore === undefined) return null;
  return `${ctScore}-${tScore}`;
}

function formatEquipExtra(
  helmet: boolean | null | undefined,
  defuseKit: boolean | null | undefined,
  armor: number | null | undefined,
): string {
  // Helmet only matters when armor>0 (CS2 keeps helmet flag even after
  // armor depletes; rendering "+kit" when bare-headed would mislead).
  const hasHelmet = (armor ?? 0) > 0 && helmet === true;
  const hasDefuseKit = defuseKit === true;
  if (hasHelmet && hasDefuseKit) return " +kit +defuse";
  if (hasHelmet) return " +kit";
  if (hasDefuseKit) return " +defuse";
  return "";
}

/**
 * Decide which CS2 utility slugs to narrow the lineup query by.
 *
 * Three-tier preference, mirroring the design in PR 10:
 *   1. Manual override (operator picked a specific utility) — wins over GSI.
 *   2. Active utility (player is currently holding a specific grenade) —
 *      strongest auto signal; narrow to that one.
 *   3. Held utility (player has grenades but not actively holding any) —
 *      narrow to anything they have in inventory.
 *
 * Returns:
 *   - `string[]` of slugs when a narrowing should be applied
 *   - `null` when the lineup query should NOT add a utility filter
 *     (i.e., show all utility types for the map/side/zone — current PR 9a
 *     behavior)
 *
 * Pure function — easy to unit test, easy to verify the three-tier
 * preference order behaves consistently.
 */
export function computeLineupUtilityFilter(args: {
  /** Operator's manual choice. `null` = no override; takes precedence. */
  overrideSlug: Cs2UtilitySlug | null;
  /** GSI-derived currently-held grenade slug, if any. */
  activeUtilitySlug: string | null | undefined;
  /** GSI-derived list of all grenades in inventory. */
  heldUtilitySlugs: readonly string[] | null | undefined;
}): string[] | null {
  if (args.overrideSlug) return [args.overrideSlug];
  if (args.activeUtilitySlug) return [args.activeUtilitySlug];
  if (args.heldUtilitySlugs && args.heldUtilitySlugs.length > 0) {
    return [...args.heldUtilitySlugs];
  }
  return null;
}

export function summarizeLiveBar(event: GsiEvent | null): LiveBarFields | null {
  if (!event) return null;
  if (!event.map_slug && !event.map_phase) return null;
  const mapDisplay = event.map_slug
    ? event.map_slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  const roundPhaseDisplay = event.round_phase
    ? ROUND_PHASE_LABELS[event.round_phase] ?? null
    : null;

  const bombDisplay = event.bomb_state
    ? BOMB_STATE_LABELS[event.bomb_state] ?? null
    : null;

  return {
    mapDisplay,
    sideDisplay: SIDE_LABELS_CS2[event.side] ?? "—",
    phaseDisplay: MAP_PHASE_LABELS[event.map_phase] ?? event.map_phase ?? "—",
    roundPhaseDisplay,
    scoreDisplay: formatScore(event.ct_score, event.t_score),
    moneyDisplay: formatMoney(event.money),
    equipExtra: formatEquipExtra(event.helmet, event.defuse_kit, event.armor),
    bombDisplay,
  };
}

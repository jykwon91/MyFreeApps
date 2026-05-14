/**
 * Live mode for CS2 — `/live/cs2`.
 *
 * Subscribes to GSI events via `useGsiState` (Tauri-only). Reflects the
 * detected (map, side, zone, utility) into a `/api/lineups` query and
 * renders a compact horizontal lineup card strip.
 *
 * PR 10 added the utility-held filter:
 *
 *   1. GSI emits `active_utility` (the grenade the player is currently
 *      holding) and `held_utility_slugs` (everything in their inventory).
 *   2. `computeLineupUtilityFilter` decides the narrowing: active wins,
 *      then held, then no filter.
 *   3. Operator can override with a specific slug via the override panel.
 *
 * The HUD top bar (LiveTopBar) was also expanded to surface money / score
 * / bomb state / round phase — see that component for the layout.
 *
 * Constraints:
 *   - No Valorant — `gsi:` events are CS2-only. Valorant lives in PR 11.
 *   - No round clock — CS2 redacts the actual round timer for competitive
 *     integrity. The round phase chip ("Freezetime" / "Live" / "Over") is
 *     the closest proxy we can surface honestly.
 *
 * Web behaviour:
 *   - On the web build, this route renders a "Live mode is a desktop
 *     feature" placeholder. The receiver isn't running anywhere reachable
 *     from the browser, so even with mock GSI data the route can't do its
 *     job from the web bundle.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Monitor, Settings as SettingsIcon } from "lucide-react";
import {
  computeLineupUtilityFilter,
  summarizeLiveBar,
  useGsiState,
} from "@/lib/gsi";
import { useCvState } from "@/lib/cv";
import { useGetLineupsQuery } from "@/store/lineupsApi";
import { isTauri } from "@/lib/tauri";
import LineupCard from "@/components/lineup/LineupCard";
import LiveTopBar from "@/components/live/LiveTopBar";
import LiveOverridePanel from "@/components/live/LiveOverridePanel";
import LiveStripSkeleton from "@/components/live/LiveStripSkeleton";
import type { Cs2UtilitySlug, GsiSide } from "@/types/desktop";
import type { Lineup } from "@/types/game";

const GAME_SLUG_CS2 = "cs2";

/**
 * Override state — what the operator manually set, regardless of GSI.
 * Extracted into a named interface per the
 * `feedback_minimize_ternaries_extract_types` preference.
 */
interface OverrideState {
  enabled: boolean;
  mapSlug: string;
  side: GsiSide;
  utility: Cs2UtilitySlug | null;
}

const INITIAL_OVERRIDE: OverrideState = {
  enabled: false,
  mapSlug: "",
  side: "any",
  utility: null,
};

export default function LiveCs2() {
  // ALL hooks must be called unconditionally; the early return for web
  // happens below the hook block so React's rules-of-hooks stay intact.
  const [inTauri] = useState(() => isTauri());
  const [override, setOverride] = useState<OverrideState>(INITIAL_OVERRIDE);

  const { event, status, ready } = useGsiState();
  // CV pipeline state (PR 9a). On the web build this returns ready=true with
  // null zone/status — same degraded shape as useGsiState — so no extra
  // gating is required.
  const { zone: cvZone } = useCvState();

  // Apply always-on-top + small window shape on mount (Tauri only). Restore
  // on unmount.
  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;
    async function configureWindow() {
      try {
        const { getCurrentWebviewWindow } = await import(
          "@tauri-apps/api/webviewWindow"
        );
        const win = getCurrentWebviewWindow();
        await win.setAlwaysOnTop(true);
      } catch {
        // Non-fatal — Live mode still works without always-on-top. The
        // user can manually pin their window manager if needed.
      }
      if (cancelled) return;
    }
    void configureWindow();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          const { getCurrentWebviewWindow } = await import(
            "@tauri-apps/api/webviewWindow"
          );
          const win = getCurrentWebviewWindow();
          await win.setAlwaysOnTop(false);
        } catch {
          // ignore — best-effort cleanup
        }
      })();
    };
  }, [inTauri]);

  // Resolve the effective (map, side, zone, utility) from override + GSI.
  const effectiveMapSlug = override.enabled
    ? override.mapSlug
    : event?.map_slug ?? "";
  const effectiveSide: GsiSide = override.enabled
    ? override.side
    : event?.side ?? "any";

  // Effective zone slug: CV-detected when not overriding, undefined when
  // overriding (operator manually picks map+side, zone narrowing doesn't
  // apply) or no CV detection yet.
  const effectiveZone = !override.enabled && cvZone ? cvZone : undefined;

  // PR 10 — utility filter narrowing.
  //
  // We compute the slugs in a memo so the inner `useGetLineupsQuery` cache
  // key stays stable across renders that don't actually change inputs.
  const utilityFilterSlugs = useMemo<string[] | null>(() => {
    if (override.enabled) {
      // In override mode, the operator's explicit choice wins. If they
      // picked "All utility" (null), no narrowing — same as PR 9a.
      return computeLineupUtilityFilter({
        overrideSlug: override.utility,
        activeUtilitySlug: null,
        heldUtilitySlugs: null,
      });
    }
    return computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: event?.active_utility ?? null,
      heldUtilitySlugs: event?.held_utility_slugs ?? null,
    });
  }, [
    override.enabled,
    override.utility,
    event?.active_utility,
    event?.held_utility_slugs,
  ]);

  // F1 → open plan mode for the detected map in a new tab so the live
  // overlay stays visible. Falls back to opening the current window if
  // we're outside Tauri.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "F1") return;
      if (!effectiveMapSlug) return;
      e.preventDefault();
      const planHref = `/${GAME_SLUG_CS2}/${effectiveMapSlug}${
        effectiveSide !== "any" ? `?side=${effectiveSide}` : ""
      }`;
      // Use window.open so the live overlay isn't replaced
      window.open(planHref, "_blank", "noopener");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [effectiveMapSlug, effectiveSide]);

  // Fetch lineups for the effective (map, side, zone, utility). Skip until
  // we have a map slug to look up.
  const lineupQueryArgs = useMemo(
    () => ({
      game_slug: GAME_SLUG_CS2,
      map_slug: effectiveMapSlug,
      side: effectiveSide !== "any" ? effectiveSide : undefined,
      target_zone_slug: effectiveZone,
      utility_type_slugs:
        utilityFilterSlugs && utilityFilterSlugs.length > 0
          ? utilityFilterSlugs.join(",")
          : undefined,
    }),
    [effectiveMapSlug, effectiveSide, effectiveZone, utilityFilterSlugs],
  );

  const { data: lineups = [], isFetching: lineupsFetching } =
    useGetLineupsQuery(lineupQueryArgs, { skip: !effectiveMapSlug });

  // Web build: render a placeholder. Hooks above must still run to satisfy
  // rules-of-hooks, but the rest of the page is desktop-only.
  if (!inTauri) {
    return <LiveCs2WebPlaceholder />;
  }

  const liveBar = summarizeLiveBar(event);
  const hasAnyMap = effectiveMapSlug.length > 0;

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      <LiveTopBar
        ready={ready}
        running={status?.running ?? false}
        payloadsReceived={status?.payloads_received ?? 0}
        lastEventAt={status?.last_event_at}
        liveBar={liveBar}
        override={override}
        onOverrideToggle={(enabled) => setOverride((p) => ({ ...p, enabled }))}
        zoneSlug={effectiveZone ?? null}
        utilityFilter={utilityFilterSlugs}
      />

      <LiveOverridePanel
        visible={override.enabled}
        override={override}
        onChange={setOverride}
      />

      <LiveStripSection
        hasAnyMap={hasAnyMap}
        ready={ready}
        running={status?.running ?? false}
        payloadsReceived={status?.payloads_received ?? 0}
        effectiveMapSlug={effectiveMapSlug}
        effectiveSide={effectiveSide}
        effectiveZone={effectiveZone}
        utilityFilterSlugs={utilityFilterSlugs}
        lineupsFetching={lineupsFetching}
        lineups={lineups}
      />

      <footer className="text-xs text-muted-foreground px-3 py-1 border-t flex items-center justify-between gap-3">
        <span>
          Live mode — F1 for plan mode. <Link to="/live/cs2/setup" className="underline">Setup</Link>
        </span>
        <span>
          {status?.running ? `Receiver :${status.port}` : "Receiver not running"}
        </span>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LiveStripSectionProps {
  hasAnyMap: boolean;
  ready: boolean;
  running: boolean;
  payloadsReceived: number;
  effectiveMapSlug: string;
  effectiveSide: GsiSide;
  effectiveZone: string | undefined;
  utilityFilterSlugs: readonly string[] | null;
  lineupsFetching: boolean;
  lineups: readonly Lineup[];
}

function LiveStripSection({
  hasAnyMap,
  ready,
  running,
  payloadsReceived,
  effectiveMapSlug,
  effectiveSide,
  effectiveZone,
  utilityFilterSlugs,
  lineupsFetching,
  lineups,
}: LiveStripSectionProps) {
  if (!hasAnyMap) {
    return (
      <section className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
        <LiveEmptyState
          ready={ready}
          running={running}
          payloadsReceived={payloadsReceived}
        />
      </section>
    );
  }
  if (lineupsFetching) {
    return (
      <section className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
        <LiveStripSkeleton />
      </section>
    );
  }
  if (lineups.length === 0) {
    return (
      <section className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
        <NoLineupsMessage
          mapSlug={effectiveMapSlug}
          side={effectiveSide}
          zone={effectiveZone}
          utilitySlugs={utilityFilterSlugs}
        />
      </section>
    );
  }
  return (
    <section className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
      <div className="flex gap-3 h-full">
        {lineups.slice(0, 6).map((l) => (
          <div key={l.id} className="w-64 shrink-0">
            <LineupCard lineup={l} variant="thumbnail" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface NoLineupsMessageProps {
  mapSlug: string;
  side: GsiSide;
  zone: string | undefined;
  utilitySlugs: readonly string[] | null;
}

function NoLineupsMessage({ mapSlug, side, zone, utilitySlugs }: NoLineupsMessageProps) {
  const zonePart = zone ? ` in ${zone}` : "";
  const utilityPart =
    utilitySlugs && utilitySlugs.length > 0
      ? ` for ${utilitySlugs.join("/")}`
      : "";
  return (
    <p className="text-sm text-muted-foreground p-4">
      No lineups for {mapSlug} on {side}
      {zonePart}
      {utilityPart}. Add one in plan mode (press F1).
    </p>
  );
}

interface LiveEmptyStateProps {
  ready: boolean;
  running: boolean;
  payloadsReceived: number;
}

function LiveEmptyState({ ready, running, payloadsReceived }: LiveEmptyStateProps) {
  // Three layered states: not-ready → receiver-not-running → waiting-for-cs2
  if (!ready) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Connecting to GSI receiver...
      </div>
    );
  }
  if (!running) {
    return (
      <div className="p-4 space-y-2 max-w-md">
        <p className="text-sm font-medium">GSI receiver isn't running.</p>
        <p className="text-xs text-muted-foreground">
          The Rust HTTP receiver couldn't bind to its port. Try restarting
          MyGamingAssistant, or check{" "}
          <Link to="/live/cs2/setup" className="underline">Setup</Link> for
          diagnostics.
        </p>
      </div>
    );
  }
  if (payloadsReceived === 0) {
    return (
      <div className="p-4 space-y-2 max-w-md">
        <p className="text-sm font-medium">Waiting for CS2.</p>
        <p className="text-xs text-muted-foreground">
          Make sure CS2 is running and the GSI config is installed.{" "}
          <Link to="/live/cs2/setup" className="underline">Open Setup</Link>{" "}
          to install or test the config.
        </p>
      </div>
    );
  }
  // Receiver is connected AND we've received events, but the current event
  // is in a map-less state (menu, intermission with no map field). Show a
  // hint rather than an empty card strip.
  return (
    <div className="p-4 text-sm text-muted-foreground">
      Connected — currently no map loaded. Lineups will appear when you load
      a competitive map.
    </div>
  );
}

function LiveCs2WebPlaceholder() {
  return (
    <main className="p-8 max-w-2xl space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Monitor className="w-5 h-5" />
        Live mode is a desktop feature
      </h1>
      <p className="text-sm text-muted-foreground">
        Live mode reads Counter-Strike 2's Game State Integration feed
        directly. It only works inside the MyGamingAssistant desktop
        application, which runs locally on your computer.
      </p>
      <p className="text-sm text-muted-foreground">
        On the web you can still use the full plan mode — pick a game and map
        from the home screen.
      </p>
      <Link
        to="/live/cs2/setup"
        className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-md border bg-card hover:bg-muted/40 text-sm"
      >
        <SettingsIcon className="w-4 h-4" />
        View setup instructions
      </Link>
    </main>
  );
}

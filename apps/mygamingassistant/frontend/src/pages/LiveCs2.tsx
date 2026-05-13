/**
 * Live mode for CS2 — `/live/cs2`.
 *
 * This is the first "live mode" surface in the app. It:
 *   1. Subscribes to GSI events via `useGsiState` (Tauri-only).
 *   2. Reflects the detected (map, side) into a `/api/lineups` query.
 *   3. Renders a compact horizontal lineup card strip.
 *   4. Auto-applies an always-on-top, small, borderless window shape on
 *      mount (Tauri-only) and restores it on unmount.
 *   5. Exposes a manual override toggle so the operator can lock the
 *      filter to a specific map/side when CS2 isn't running (for testing
 *      and pre-match prep).
 *   6. Wires F1 to open the full plan-mode panel in the same window.
 *
 * Constraints from the PR 8 spec:
 *   - No player position detection (PR 9 will add minimap CV).
 *   - No utility-held filter (PR 10).
 *   - No Valorant — `gsi:` events are CS2-only.
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
import { useGsiState, summarizeLiveBar } from "@/lib/gsi";
import { useGetLineupsQuery } from "@/store/lineupsApi";
import { isTauri } from "@/lib/tauri";
import LineupCard from "@/components/lineup/LineupCard";
import LiveTopBar from "@/components/live/LiveTopBar";
import LiveOverridePanel from "@/components/live/LiveOverridePanel";
import LiveStripSkeleton from "@/components/live/LiveStripSkeleton";
import type { GsiSide } from "@/types/desktop";

const GAME_SLUG_CS2 = "cs2";

export default function LiveCs2() {
  // ALL hooks must be called unconditionally; the early return for web
  // happens below the hook block so React's rules-of-hooks stay intact.
  const [inTauri] = useState(() => isTauri());
  const [override, setOverride] = useState<{
    enabled: boolean;
    mapSlug: string;
    side: GsiSide;
  }>({ enabled: false, mapSlug: "", side: "any" });

  const { event, status, ready } = useGsiState();

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
        // Capture previous shape so we can restore on unmount.
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

  // F1 → open plan mode for the detected map in a new tab so the live
  // overlay stays visible. Falls back to opening the current window if
  // we're outside Tauri.
  const effectiveMapSlug = override.enabled ? override.mapSlug : event?.map_slug ?? "";
  const effectiveSide: GsiSide = override.enabled
    ? override.side
    : event?.side ?? "any";

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

  // Fetch lineups for the effective (map, side). Skip until we have a map
  // slug to look up.
  const lineupQueryArgs = useMemo(
    () => ({
      game_slug: GAME_SLUG_CS2,
      map_slug: effectiveMapSlug,
      side: effectiveSide !== "any" ? effectiveSide : undefined,
    }),
    [effectiveMapSlug, effectiveSide],
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
      />

      <LiveOverridePanel
        visible={override.enabled}
        override={override}
        onChange={setOverride}
      />

      <section className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
        {!hasAnyMap ? (
          <LiveEmptyState
            ready={ready}
            running={status?.running ?? false}
            payloadsReceived={status?.payloads_received ?? 0}
          />
        ) : lineupsFetching ? (
          <LiveStripSkeleton />
        ) : lineups.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">
            No lineups for {effectiveMapSlug} on {effectiveSide}. Add one in
            plan mode (press F1).
          </p>
        ) : (
          <div className="flex gap-3 h-full">
            {lineups.slice(0, 6).map((l) => (
              <div key={l.id} className="w-64 shrink-0">
                <LineupCard lineup={l} variant="thumbnail" />
              </div>
            ))}
          </div>
        )}
      </section>

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

/**
 * LiveCs2CvPanel — CV pipeline controls + status (PR 9a).
 *
 * Shown on the `/live/cs2/setup` page below the GSI install card.
 *
 * What it does:
 *   - Reports pipeline running / stopped state.
 *   - Reports whether a calibration is loaded for the currently-tracked map.
 *   - Reports tick counters + average latency so operators can verify the
 *     pipeline is healthy before launching CS2.
 *   - Start / Stop buttons hit the `cv_start` / `cv_stop` IPC commands.
 *
 * What it does NOT do (PR 9a):
 *   - Calibration editor — PR 9b's domain.
 *   - Per-resolution / per-HUD-scale settings — PR 9b will add these.
 */
import { useState } from "react";
import { Card, LoadingButton } from "@platform/ui";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Eye,
  MapPin,
  PauseCircle,
  PlayCircle,
  Timer,
} from "lucide-react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import { formatZoneDisplay } from "@/lib/cv";
import type { CvStatus } from "@/types/desktop";

interface LiveCs2CvPanelProps {
  /** Latest cv_status snapshot from `useCvState`. */
  status: CvStatus | null;
  /** True once useCvState has finished its initial wiring. */
  ready: boolean;
  /** Triggered by the parent on Start/Stop success — refreshes status. */
  onRefresh: () => Promise<void>;
}

export default function LiveCs2CvPanel({
  status,
  ready,
  onRefresh,
}: LiveCs2CvPanelProps) {
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStart() {
    setBusy("start");
    setActionError(null);
    try {
      await invokeTauri<void>("cv_start");
      await onRefresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setActionError(formatStartError(m));
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("stop");
    setActionError(null);
    try {
      await invokeTauri<void>("cv_stop");
      await onRefresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setActionError(`Stop failed: ${m}`);
    } finally {
      setBusy(null);
    }
  }

  // Web build: render a small "desktop-only" hint and bail.
  if (!isTauri()) {
    return (
      <Card title="Position detection (CV)">
        <p className="text-sm text-muted-foreground">
          The minimap CV pipeline runs inside the MyGamingAssistant desktop
          app. On the web build, position detection isn't available.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Position detection (CV)">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Detects your player position on the minimap and narrows the live
          lineup strip to the current zone (e.g., A Site, B Apartments).
          Position detection complements GSI: GSI gives map + side, CV adds
          zone.
        </p>

        {!status?.platform_supported ? (
          <PlatformUnsupportedBanner />
        ) : (
          <>
            <CvStatusGrid ready={ready} status={status} />

            <div className="flex gap-2 flex-wrap">
              <LoadingButton
                isLoading={busy === "start"}
                loadingText="Starting..."
                onClick={handleStart}
                disabled={
                  busy !== null || (status?.running ?? false)
                }
              >
                <PlayCircle className="w-4 h-4 mr-1" aria-hidden />
                Start CV
              </LoadingButton>
              <LoadingButton
                isLoading={busy === "stop"}
                loadingText="Stopping..."
                variant="secondary"
                onClick={handleStop}
                disabled={busy !== null || !(status?.running ?? false)}
              >
                <PauseCircle className="w-4 h-4 mr-1" aria-hidden />
                Stop CV
              </LoadingButton>
            </div>

            {actionError && (
              <div className="text-sm p-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                <span>{actionError}</span>
              </div>
            )}
          </>
        )}

        <CalibrationDisclaimer />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlatformUnsupportedBanner() {
  return (
    <div className="text-sm p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
      <p className="font-medium flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden />
        Windows only
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Position detection uses Windows screen capture. On macOS and Linux,
        the live mode top bar still shows map and side from GSI, but the
        per-zone narrowing isn't available yet.
      </p>
    </div>
  );
}

interface CvStatusGridProps {
  ready: boolean;
  status: CvStatus;
}

function CvStatusGrid({ ready, status }: CvStatusGridProps) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <Row
        icon={<Activity className="w-4 h-4" aria-hidden />}
        label="Pipeline"
        value={
          !ready ? (
            <span className="text-muted-foreground">Initializing…</span>
          ) : status.running ? (
            <span className="text-green-600 dark:text-green-400">Running</span>
          ) : (
            <span className="text-muted-foreground">Stopped</span>
          )
        }
      />
      <Row
        icon={<MapPin className="w-4 h-4" aria-hidden />}
        label="Calibration"
        value={
          status.calibration_loaded ? (
            <span className="text-green-600 dark:text-green-400">
              Loaded for {status.current_map ?? "unknown"}
            </span>
          ) : status.current_map ? (
            <span className="text-amber-600 dark:text-amber-400">
              No calibration for {status.current_map} (load de_mirage to test)
            </span>
          ) : (
            <span className="text-muted-foreground">Waiting for map</span>
          )
        }
      />
      <Row
        icon={<Eye className="w-4 h-4" aria-hidden />}
        label="Detected zone"
        value={
          status.last_zone ? (
            <span>{formatZoneDisplay(status.last_zone)}</span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )
        }
      />
      <Row
        icon={<Timer className="w-4 h-4" aria-hidden />}
        label="Tick latency (avg / last)"
        value={
          <span>
            {status.avg_tick_ms.toFixed(1)} ms / {status.last_tick_ms.toFixed(1)} ms
          </span>
        }
      />
      <Row
        icon={<Cpu className="w-4 h-4" aria-hidden />}
        label="Ticks (total / errored)"
        value={
          <span>
            {status.ticks_total} / {status.ticks_errored}
          </span>
        }
      />
      {status.last_error && (
        <Row
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden />}
          label="Last error"
          value={
            <span className="text-xs text-amber-600 dark:text-amber-400 break-words">
              {status.last_error}
            </span>
          }
        />
      )}
    </dl>
  );
}

function CalibrationDisclaimer() {
  return (
    <div className="border-t pt-2 space-y-1">
      <p className="text-xs text-muted-foreground">
        The bundled default calibration is for <code>de_mirage</code> at{" "}
        <code>1920×1080</code>. For other maps + resolutions, use the
        calibration editor.
      </p>
      <a
        href="/live/cs2/calibrate"
        className="text-xs text-primary hover:underline inline-flex items-center"
      >
        Open calibration editor →
      </a>
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function Row({ icon, label, value }: RowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Translate the `cv-platform-not-supported` Rust error string into a friendly
 * sentence. Other errors pass through unchanged.
 */
function formatStartError(raw: string): string {
  if (raw.includes("cv-platform-not-supported")) {
    return "CV pipeline isn't available on this OS (PR 9a ships Windows only).";
  }
  return `Start failed: ${raw}`;
}


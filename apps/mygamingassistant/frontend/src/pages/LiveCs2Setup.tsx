/**
 * CS2 GSI setup — `/live/cs2/setup`.
 *
 * What this page does:
 *   1. Reports current receiver status (running / waiting / payloads).
 *   2. Lets the operator install the CS2 GSI cfg file.
 *   3. Lets the operator paste a custom CS2 install path when the
 *      auto-detected default doesn't work (e.g., non-default Steam library).
 *   4. Lets the operator uninstall the cfg.
 *   5. Polls the status while the operator is on the page so they see the
 *      "Waiting → Connected" transition the moment CS2 starts.
 *
 * Web build: shows the same placeholder as the live mode page (this is a
 * Tauri-only surface). All IPC calls would no-op in the browser anyway.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Trash2, XCircle } from "lucide-react";
import { Card, LoadingButton } from "@platform/ui";
import { useGsiState } from "@/lib/gsi";
import { useCvState } from "@/lib/cv";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type {
  GsiInstallResult,
  GsiServerStatus,
  GsiUninstallResult,
} from "@/types/desktop";
import LiveCs2SetupStatus from "@/components/live/LiveCs2SetupStatus";
import LiveCs2CvPanel from "@/components/live/LiveCs2CvPanel";

async function refreshStatus(): Promise<GsiServerStatus | null> {
  try {
    return await invokeTauri<GsiServerStatus>("gsi_server_status");
  } catch {
    return null;
  }
}

export default function LiveCs2Setup() {
  const [inTauri] = useState(() => isTauri());
  const { status: initialStatus, ready } = useGsiState();
  // CV pipeline status — refreshed by the panel's Start/Stop callbacks AND
  // by useCvState's 2s poll. Used for the new CV section below the GSI
  // install card.
  const cvHook = useCvState();

  // Local status copy that we can refresh manually after install/uninstall
  // without waiting for the next pushed event. Falls back to the
  // useGsiState-provided status as the source of truth.
  const [status, setStatus] = useState<GsiServerStatus | null>(null);

  // Sync from useGsiState into local state — useGsiState's status is the
  // canonical source after mount. We mirror so we can also overwrite from
  // the explicit refresh button. Defer the setState via MessageChannel so
  // React's "no setState in an effect body" rule stays happy.
  useEffect(() => {
    if (!initialStatus) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => setStatus(initialStatus);
    channel.port2.postMessage(null);
    return () => channel.port1.close();
  }, [initialStatus]);

  const [customPath, setCustomPath] = useState("");
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [installResult, setInstallResult] = useState<GsiInstallResult | null>(null);
  const [uninstallResult, setUninstallResult] =
    useState<GsiUninstallResult | null>(null);

  // Refresh status every 2s while we're on the setup page. The receiver
  // emits pushed events too, but a fallback poll guarantees the page
  // updates even if the user installed CS2 mid-session and we miss the
  // first event.
  useEffect(() => {
    if (!inTauri) return;
    const interval = setInterval(() => {
      void refreshStatus().then((s) => {
        if (s) setStatus(s);
      });
    }, 2_000);
    return () => clearInterval(interval);
  }, [inTauri]);

  async function handleInstall() {
    setInstalling(true);
    setInstallResult(null);
    try {
      const result = await invokeTauri<GsiInstallResult>(
        "install_cs2_gsi_config",
        // Tauri serializes `null` to Rust's `Option::None`. Empty string
        // would be `Some("")` which the Rust resolver treats as falsy.
        { customPath: customPath.trim() || null },
      );
      setInstallResult(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setInstallResult({
        installed: false,
        path: "",
        error: `IPC failed: ${message}`,
      });
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall() {
    setUninstalling(true);
    setUninstallResult(null);
    try {
      const result = await invokeTauri<GsiUninstallResult>(
        "uninstall_cs2_gsi_config",
        { customPath: customPath.trim() || null },
      );
      setUninstallResult(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setUninstallResult({
        removed: false,
        path: "",
        error: `IPC failed: ${message}`,
      });
    } finally {
      setUninstalling(false);
    }
  }

  if (!inTauri) {
    return (
      <main className="p-8 max-w-2xl space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="text-xl font-semibold">CS2 Live Setup</h1>
        <p className="text-sm text-muted-foreground">
          This page configures the desktop app's connection to Counter-Strike
          2's Game State Integration feed. It only works inside the
          MyGamingAssistant desktop application.
        </p>
        <Card title="What you'll need">
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>CS2 installed on the same computer</li>
            <li>The MyGamingAssistant desktop app (download from your account)</li>
            <li>About one minute to click "Install"</li>
          </ul>
        </Card>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link
          to="/live/cs2"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to live mode
        </Link>
      </div>
      <h1 className="text-xl font-semibold">CS2 Live Setup</h1>
      <p className="text-sm text-muted-foreground">
        Live mode listens to Counter-Strike 2's Game State Integration feed
        and auto-filters your lineup library to the current map and side. To
        enable it, install the config file below, then start CS2.
      </p>

      <LiveCs2SetupStatus ready={ready} status={status} />

      <Card title="Install GSI config">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This writes a small file into CS2's <code>cfg/</code> directory.
            CS2 reads it at launch and starts sending its game state to this
            app at <code>http://127.0.0.1:{status?.port ?? 8765}</code>.
          </p>
          <div className="space-y-1">
            <label htmlFor="custom-path" className="text-xs text-muted-foreground">
              Custom CS2 cfg path (optional — leave blank to auto-detect)
            </label>
            <input
              id="custom-path"
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder='e.g. D:\Games\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg'
              className="w-full px-3 py-2 rounded-md border bg-background text-sm min-h-[36px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Only set this when CS2 lives outside the default Steam install.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <LoadingButton
              isLoading={installing}
              loadingText="Installing..."
              onClick={handleInstall}
            >
              Install GSI config
            </LoadingButton>
            <LoadingButton
              isLoading={uninstalling}
              loadingText="Removing..."
              variant="secondary"
              onClick={handleUninstall}
            >
              <Trash2 className="w-4 h-4 mr-1" aria-hidden />
              Uninstall
            </LoadingButton>
          </div>

          {installResult && <InstallFeedback result={installResult} />}
          {uninstallResult && <UninstallFeedback result={uninstallResult} />}
        </div>
      </Card>

      <Card title="Verify the connection">
        <div className="text-sm space-y-2">
          <p>
            Once the config is installed, launch CS2. Within a few seconds the
            status card above should switch to "Connected". Load any map (a
            local match against bots works) — the map and side should appear
            in the status line.
          </p>
          <a
            href="https://developer.valvesoftware.com/wiki/Counter-Strike_Global_Offensive_Game_State_Integration"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            CS2 GSI docs
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        </div>
      </Card>

      <LiveCs2CvPanel
        status={cvHook.status}
        ready={cvHook.ready}
        onRefresh={cvHook.refresh}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Inner feedback components
// ---------------------------------------------------------------------------

interface InstallFeedbackProps {
  result: GsiInstallResult;
}

function InstallFeedback({ result }: InstallFeedbackProps) {
  if (result.installed) {
    return (
      <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-green-500/10 border border-green-500/30">
        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Config installed.</p>
          <p className="text-xs text-muted-foreground break-all">{result.path}</p>
          <p className="text-xs mt-1">
            Launch CS2 (or restart it if it's already running) to pick up the
            new config.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-destructive/10 border border-destructive/30">
      <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Install failed.</p>
        {result.error && <p className="text-xs text-muted-foreground">{result.error}</p>}
        {result.path && (
          <p className="text-xs text-muted-foreground break-all">
            Attempted path: {result.path}
          </p>
        )}
      </div>
    </div>
  );
}

function UninstallFeedback({ result }: { result: GsiUninstallResult }) {
  if (result.removed) {
    return (
      <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-muted/40 border">
        <CheckCircle2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Config removed.</p>
          <p className="text-xs text-muted-foreground break-all">{result.path}</p>
          <p className="text-xs mt-1">
            CS2 will no longer post game state to this app. Restart CS2 to
            apply the change.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-muted/40 border">
      <XCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Nothing to remove.</p>
        {result.error && <p className="text-xs text-muted-foreground">{result.error}</p>}
      </div>
    </div>
  );
}

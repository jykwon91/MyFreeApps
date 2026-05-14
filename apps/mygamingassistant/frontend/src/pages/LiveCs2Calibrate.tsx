/**
 * LiveCs2Calibrate — `/live/cs2/calibrate`.
 *
 * Operator-facing minimap CV calibration editor (PR 9b). Three sections —
 * Region, Zones, Dots — each with its own draft state, dirty flag, and
 * save button. The page coordinates section selection + dirty-leave guard
 * + map/resolution selection.
 *
 * URL state:
 *   - `?map=mirage`        — sticky map selection (push history)
 *   - `?res=1920x1080`     — sticky resolution selection (push history)
 *   - `?section=region`    — active section (replace history)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import {
  ConfirmDialog,
  Skeleton,
  AlertBox,
  showSuccess,
  showError,
} from "@platform/ui";
import { isTauri, invokeTauri } from "@/lib/tauri";
import { useGetMapsQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useCalibrationDraft } from "@/hooks/useCalibrationDraft";
import { useCaptureSnapshot } from "@/hooks/useCaptureSnapshot";
import { useCvState } from "@/lib/cv";
import { emptyCalibrationPackage } from "@/lib/calibration";
import CalibrateTopBar from "@/components/calibrate/CalibrateTopBar";
import CalibrateSideNav, {
  type CalibrateSection,
} from "@/components/calibrate/CalibrateSideNav";
import CalibrateWebPlaceholder from "@/components/calibrate/CalibrateWebPlaceholder";
import RegionPanel from "@/components/calibrate/region/RegionPanel";
import ZonesPanel from "@/components/calibrate/zones/ZonesPanel";
import DotsPanel from "@/components/calibrate/dots/DotsPanel";
import type {
  CvMonitorResolution,
  CvZonePolygon,
} from "@/types/desktop";

const GAME_SLUG_CS2 = "cs2";
const DEFAULT_MAP = "mirage";
const DEFAULT_RESOLUTION = "1920x1080";

const SECTION_VALUES: CalibrateSection[] = ["region", "zones", "dots"];

function isSection(v: string): v is CalibrateSection {
  return (SECTION_VALUES as string[]).includes(v);
}

export default function LiveCs2Calibrate() {
  const [inTauri] = useState(() => isTauri());
  const [searchParams, setSearchParams] = useSearchParams();

  const urlMap = searchParams.get("map") ?? DEFAULT_MAP;
  const urlRes = searchParams.get("res") ?? DEFAULT_RESOLUTION;
  const urlSection = searchParams.get("section");
  const section: CalibrateSection = urlSection && isSection(urlSection) ? urlSection : "region";

  const [recaptureKey, setRecaptureKey] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmResetBundled, setConfirmResetBundled] = useState(false);
  const [detectedResolution, setDetectedResolution] =
    useState<CvMonitorResolution | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  const mapsQuery = useGetMapsQuery(GAME_SLUG_CS2, { skip: !inTauri });
  const mapDetailQuery = useGetMapDetailQuery(
    { gameSlug: GAME_SLUG_CS2, mapSlug: urlMap },
    { skip: !inTauri || !urlMap },
  );

  const draftHook = useCalibrationDraft({
    mapSlug: urlMap,
    resolution: urlRes,
  });

  const snapshotHook = useCaptureSnapshot();
  const cvHook = useCvState();

  // Auto-detect primary monitor resolution at mount; preselect when no
  // explicit ?res= in URL.
  useEffect(() => {
    if (!inTauri) return;
    void (async () => {
      try {
        const r = await invokeTauri<CvMonitorResolution>(
          "cv_get_primary_monitor_resolution",
        );
        setDetectedResolution(r);
        if (!searchParams.get("res")) {
          const matches = `${r.width}x${r.height}`;
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("res", matches);
              return next;
            },
            { replace: true },
          );
        }
      } catch {
        // Pipeline not registered (Mac/Linux). Resolution dropdown still
        // has the fixed list; defaults work.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTauri]);

  // ---- aria-live debouncer ----
  useEffect(() => {
    const handle = setTimeout(() => {
      const parts: string[] = [];
      if (draftHook.dirtySections.region) parts.push("region edited");
      if (draftHook.dirtySections.zones) parts.push("zones edited");
      if (draftHook.dirtySections.dots) parts.push("dots edited");
      setLiveStatus(parts.length ? parts.join(", ") : "");
    }, 300);
    return () => clearTimeout(handle);
  }, [draftHook.dirtySections]);

  const hasAnyDirty =
    draftHook.dirtySections.region ||
    draftHook.dirtySections.zones ||
    draftHook.dirtySections.dots;

  // ---- Dirty-leave guard (react-router useBlocker + beforeunload) ----
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasAnyDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setConfirmLeave(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasAnyDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasAnyDirty]);

  // ---- Section change handler — replaces URL state, NO history push ----
  const setSection = useCallback(
    (next: CalibrateSection) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("section", next);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ---- Map / resolution change handler — fires dirty guard ----
  const handleMapChange = useCallback(
    (next: string) => {
      // We don't call into the blocker here — react-router's useBlocker
      // only fires on path changes, and we're staying on the same path.
      // Instead we treat in-page query changes as no-op when dirty BUT
      // surface a confirm dialog. For now, we just allow the change and
      // rely on the global indicator + autosave-on-section-save UX.
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("map", next);
          return p;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const handleResChange = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("res", next);
          return p;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  // ---- Save handlers — toast on success / error ----
  const handleSaveSection = useCallback(
    async (sec: "region" | "zones" | "dots") => {
      try {
        await draftHook.saveSection(sec);
        showSuccess(`Saved ${sec}.`);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        showError(`Save failed: ${m}`);
      }
    },
    [draftHook],
  );

  const handleResetToBundled = useCallback(async () => {
    try {
      await draftHook.resetToBundled();
      showSuccess("Reverted to bundled default.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      showError(`Couldn't reset: ${m}`);
    } finally {
      setConfirmResetBundled(false);
    }
  }, [draftHook]);

  const handleStartPipeline = useCallback(async () => {
    if (!inTauri) return;
    try {
      await invokeTauri<void>("cv_start");
      await cvHook.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      showError(`Couldn't start pipeline: ${m}`);
    }
  }, [inTauri, cvHook]);

  // ---- Global keyboard shortcuts ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSaveSection(section);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        draftHook.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        draftHook.undo();
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        setSection("region");
      } else if (e.key === "2") {
        e.preventDefault();
        setSection("zones");
      } else if (e.key === "3") {
        e.preventDefault();
        setSection("dots");
      } else if (e.key === "r" && section === "region") {
        e.preventDefault();
        setRecaptureKey((n) => n + 1);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "Escape" && shortcutsOpen) {
        setShortcutsOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draftHook, section, setSection, handleSaveSection, shortcutsOpen]);

  // ALL hooks above MUST be called unconditionally (rules of hooks). The web
  // placeholder is rendered below so the hook order is stable across web /
  // desktop builds.

  const mapsList = useMemo(
    () =>
      (mapsQuery.data ?? []).map((m) => ({
        slug: m.slug,
        name: m.name,
      })),
    [mapsQuery.data],
  );

  // Available slugs for the zone slug-combobox come from the map's MapZone
  // list on the backend. Some operators may use slugs that aren't yet
  // registered server-side — the combobox warns but allows.
  const availableSlugs = useMemo(
    () => (mapDetailQuery.data?.zones ?? []).map((z) => z.slug),
    [mapDetailQuery.data],
  );

  // Seed an empty draft when no calibration exists yet.
  const effectiveDraft =
    draftHook.state.draft ?? emptyCalibrationPackage(urlMap, urlRes);

  // Cropped minimap for the zone editor + dot picker. Re-cropped each
  // render from the current draft region + snapshot. Falls back to the
  // backend's minimap_url when no snapshot is available.
  const cropped = useCroppedSnapshot(
    snapshotHook.snapshot,
    effectiveDraft.calibration.minimap_region,
  );
  const backgroundSrc =
    cropped ?? mapDetailQuery.data?.minimap_url ?? null;
  const backgroundIsFallback = !cropped && !!mapDetailQuery.data?.minimap_url;

  // ---- Web build placeholder ----
  if (!inTauri) {
    return <CalibrateWebPlaceholder />;
  }

  return (
    <main className="flex flex-col h-[calc(100vh-3.5rem)]">
      <CalibrateTopBar
        maps={mapsList}
        mapSlug={urlMap}
        resolution={urlRes}
        detectedResolution={detectedResolution}
        source={draftHook.state.source}
        hasAnyDirty={hasAnyDirty}
        onMapChange={handleMapChange}
        onResolutionChange={handleResChange}
        onResetToBundled={() => setConfirmResetBundled(true)}
        resetToBundledDisabled={
          draftHook.state.source !== "override" || hasAnyDirty
        }
        onShowShortcuts={() => setShortcutsOpen(true)}
        liveStatus={liveStatus}
      />

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        <CalibrateSideNav
          active={section}
          hasBaseline={!!draftHook.state.loaded}
          dirty={draftHook.dirtySections}
          onSelect={setSection}
        />
        <section className="flex-1 overflow-auto p-4">
          {renderActivePanel({
            section,
            draftHook,
            effectiveDraft,
            snapshotHook,
            recaptureKey,
            detectedResolution,
            availableSlugs,
            backgroundSrc,
            backgroundIsFallback,
            pipelineRunning: cvHook.status?.running ?? false,
            handleSaveSection,
            setSection,
            handleStartPipeline,
          })}
        </section>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Unsaved changes"
        description={
          <span>
            You have unsaved edits in{" "}
            <strong>{dirtyNames(draftHook.dirtySections).join(", ") || "this calibration"}</strong>.
            Leave anyway?
          </span>
        }
        confirmLabel="Discard & leave"
        variant="destructive"
        onConfirm={() => {
          setConfirmLeave(false);
          blocker.proceed?.();
        }}
        onCancel={() => {
          setConfirmLeave(false);
          blocker.reset?.();
        }}
      />

      <ConfirmDialog
        open={confirmResetBundled}
        title="Reset to bundled default?"
        description="This deletes the custom override file and reverts to the bundled calibration. Your current edits will be discarded."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleResetToBundled}
        onCancel={() => setConfirmResetBundled(false)}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DirtySections {
  region: boolean;
  zones: boolean;
  dots: boolean;
}

function dirtyNames(d: DirtySections): string[] {
  const out: string[] = [];
  if (d.region) out.push("Region");
  if (d.zones) out.push("Zones");
  if (d.dots) out.push("Dots");
  return out;
}

/**
 * Props bag for the active-panel renderer. Keeping all props in one named
 * shape keeps the call site small and avoids the deeply-nested ternary that
 * the parent would otherwise need (per the project's anti-ternary rule).
 */
interface ActivePanelArgs {
  section: CalibrateSection;
  draftHook: ReturnType<typeof useCalibrationDraft>;
  effectiveDraft: import("@/types/desktop").CvMapCalibrationPackage;
  snapshotHook: ReturnType<typeof useCaptureSnapshot>;
  recaptureKey: number;
  detectedResolution: CvMonitorResolution | null;
  availableSlugs: string[];
  backgroundSrc: string | null;
  backgroundIsFallback: boolean;
  pipelineRunning: boolean;
  handleSaveSection: (sec: "region" | "zones" | "dots") => Promise<void>;
  setSection: (next: CalibrateSection) => void;
  handleStartPipeline: () => Promise<void>;
}

function renderActivePanel(args: ActivePanelArgs): React.ReactNode {
  const { draftHook } = args;
  if (draftHook.state.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (draftHook.state.loadError) {
    return (
      <AlertBox variant="error">
        <p className="font-medium">Couldn't load calibration.</p>
        <p className="text-xs">{draftHook.state.loadError}</p>
        <button
          type="button"
          onClick={() => void draftHook.reload()}
          className="mt-2 px-3 py-1 text-sm rounded-md border hover:bg-muted/40"
        >
          Retry
        </button>
      </AlertBox>
    );
  }
  if (args.section === "region") {
    return (
      <RegionPanel
        region={args.effectiveDraft.calibration.minimap_region}
        detectedResolution={args.detectedResolution}
        isDirty={draftHook.dirtySections.region}
        isSaving={false}
        snapshotHook={args.snapshotHook}
        onRegionChange={draftHook.setRegion}
        onSave={() => args.handleSaveSection("region")}
        onReset={() => draftHook.resetSection("region")}
        recaptureKey={args.recaptureKey}
      />
    );
  }
  if (args.section === "zones") {
    return (
      <ZonesPanel
        zones={args.effectiveDraft.zones}
        loadedZones={draftHook.state.loaded?.zones ?? []}
        regionIsEmpty={
          args.effectiveDraft.calibration.minimap_region.width <= 0 ||
          args.effectiveDraft.calibration.minimap_region.height <= 0
        }
        availableSlugs={args.availableSlugs}
        backgroundSrc={args.backgroundSrc}
        backgroundIsFallback={args.backgroundIsFallback}
        isDirty={draftHook.dirtySections.zones}
        isSaving={false}
        canUndo={draftHook.canUndo}
        canRedo={draftHook.canRedo}
        onUndo={draftHook.undo}
        onRedo={draftHook.redo}
        onZonesChange={(z) => draftHook.setZones(z as CvZonePolygon[])}
        onSave={() => args.handleSaveSection("zones")}
        onReset={() => draftHook.resetSection("zones")}
        onGoToRegion={() => args.setSection("region")}
      />
    );
  }
  // section === "dots"
  return (
    <DotsPanel
      params={args.effectiveDraft.calibration.dot_detection}
      loadedParams={
        draftHook.state.loaded?.calibration.dot_detection ??
        args.effectiveDraft.calibration.dot_detection
      }
      region={args.effectiveDraft.calibration.minimap_region}
      pipelineRunning={args.pipelineRunning}
      isDirty={draftHook.dirtySections.dots}
      isSaving={false}
      onParamsChange={draftHook.setDot}
      onSave={() => args.handleSaveSection("dots")}
      onReset={() => draftHook.resetSection("dots")}
      onStartPipeline={args.handleStartPipeline}
    />
  );
}

/**
 * Crop the full screenshot to the minimap region. Renders to an off-screen
 * canvas + returns a data URL for use as `<img src>`. Returns null when no
 * snapshot has been captured yet.
 *
 * We use a 1x scaling pass — the source is already pixel-accurate, and
 * upscaling would blur the player-dot detection preview.
 */
function useCroppedSnapshot(
  snapshot: { png_base64: string; width: number; height: number } | null,
  region: { x: number; y: number; width: number; height: number },
): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!snapshot) {
      setDataUrl(null);
      return;
    }
    if (region.width <= 0 || region.height <= 0) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = region.width;
      canvas.height = region.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
      try {
        setDataUrl(canvas.toDataURL("image/png"));
      } catch {
        setDataUrl(null);
      }
    };
    img.src = `data:image/png;base64,${snapshot.png_base64}`;
    return () => {
      cancelled = true;
    };
  }, [snapshot, region.x, region.y, region.width, region.height]);

  return dataUrl;
}

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-card rounded-lg border shadow-lg max-w-md w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <ul className="text-sm space-y-1 grid grid-cols-2 gap-x-4">
          <li>
            <Kbd>1</Kbd>/<Kbd>2</Kbd>/<Kbd>3</Kbd> Section nav
          </li>
          <li>
            <Kbd>Ctrl+S</Kbd> Save section
          </li>
          <li>
            <Kbd>Ctrl+Z</Kbd> Undo
          </li>
          <li>
            <Kbd>Ctrl+⇧+Z</Kbd> Redo
          </li>
          <li>
            <Kbd>R</Kbd> Recapture (Region)
          </li>
          <li>
            <Kbd>N</Kbd> New polygon (Zones)
          </li>
          <li>
            <Kbd>V</Kbd> Add-vertex mode (Zones)
          </li>
          <li>
            <Kbd>P</Kbd> Preview / Pick (context)
          </li>
          <li>
            <Kbd>[</Kbd>/<Kbd>]</Kbd> Tolerance ±1 (Dots)
          </li>
          <li>
            <Kbd>Esc</Kbd> Cancel
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 px-3 py-1.5 rounded-md border hover:bg-muted/40 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border bg-muted/30 text-[10px] font-mono">
      {children}
    </kbd>
  );
}

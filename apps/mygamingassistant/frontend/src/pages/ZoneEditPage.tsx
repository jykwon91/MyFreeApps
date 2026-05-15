/**
 * ZoneEditPage — operator-only polygon editor for a map's plan-mode zones.
 * Route: /:gameSlug/:mapSlug/zones/edit
 *
 * Authors `MapZone.polygon_points` so MapPage's clickable SVG overlay can
 * actually render. Without this page, every zone ships with empty
 * polygon_points and the map appears as a static, unclickable image.
 *
 * Reuses `ZoneEditorCanvas` from the CV-calibration page (storage-agnostic
 * pure-render polygon editor) but mounts a different orchestrator hook
 * (`useZoneEditorDraft`) that talks to the backend instead of a Tauri file.
 *
 * Coord shape note: the canvas uses `[x, y]` tuples; the backend stores
 * `{x, y}` objects. `lib/zonePolygon` adapts at the boundary — the
 * mismatch was the design review's #1 ship-blocker.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { ConfirmDialog, showError, showSuccess } from "@platform/ui";
import { useGetMapDetailQuery, useBulkUpdateMapZonesMutation } from "@/store/gamesApi";
import { useZoneEditorDraft } from "@/hooks/useZoneEditorDraft";
import { tuplesToObjects, objectsToTuples } from "@/lib/zonePolygon";
import type { CvZonePolygon } from "@/types/desktop";
import type { ZonePolygonUpdate } from "@/types/game";
import ZoneEditorCanvas, { type EditorMode } from "@/components/calibrate/zones/ZoneEditorCanvas";
import ZoneEditorTopBar from "@/components/zone-editor/ZoneEditorTopBar";
import ZoneEditorLeftRail from "@/components/zone-editor/ZoneEditorLeftRail";
import ZoneEditorActionBar, { type ActionBarMode } from "@/components/zone-editor/ZoneEditorActionBar";
import ZoneEditorPreview from "@/components/zone-editor/ZoneEditorPreview";

const COACHMARK_STORAGE_KEY = "mga_zone_editor_seen_v1";

export default function ZoneEditPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();

  const {
    data: mapDetail,
    isLoading: mapLoading,
    isError: mapError,
    refetch: refetchMapDetail,
  } = useGetMapDetailQuery(
    { gameSlug: gameSlug ?? "", mapSlug: mapSlug ?? "" },
    { skip: !gameSlug || !mapSlug },
  );

  const draft = useZoneEditorDraft({
    mapId: mapDetail?.id,
    serverZones: mapDetail?.zones,
  });

  const [bulkUpdate, { isLoading: isSaving }] = useBulkUpdateMapZonesMutation();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [drawingPoints, setDrawingPoints] = useState<Array<[number, number]>>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);

  // ---- Draft → CvZonePolygon adapter for the canvas (tuples + names) ----
  const canvasZones: CvZonePolygon[] = useMemo(() => {
    if (!mapDetail) return [];
    return mapDetail.zones
      .map((z) => {
        const points = draft.zones[z.slug] ?? [];
        if (points.length < 3) return null;
        return {
          slug: z.slug,
          name: z.name,
          points: objectsToTuples(points),
        };
      })
      .filter((z): z is CvZonePolygon => z !== null);
  }, [mapDetail, draft.zones]);

  // ---- Auto-select first zone once data loads ----
  useEffect(() => {
    if (!mapDetail || selectedSlug) return;
    if (mapDetail.zones.length === 0) return;
    setSelectedSlug(mapDetail.zones[0].slug);
  }, [mapDetail, selectedSlug]);

  // ---- Restored-from-storage one-time toast ----
  const [restoreToastShown, setRestoreToastShown] = useState(false);
  useEffect(() => {
    if (draft.restoredFromStorage && !restoreToastShown) {
      showSuccess("Restored your in-progress draft.");
      setRestoreToastShown(true);
    }
  }, [draft.restoredFromStorage, restoreToastShown]);

  // ---- Coachmark for first-time `new` mode ----
  useEffect(() => {
    if (mode !== "new") return;
    try {
      if (localStorage.getItem(COACHMARK_STORAGE_KEY)) return;
      setShowCoachmark(true);
      localStorage.setItem(COACHMARK_STORAGE_KEY, "1");
    } catch {
      // localStorage disabled — show coachmark anyway, accept that next
      // session will show it again.
      setShowCoachmark(true);
    }
  }, [mode]);

  // ---- Dirty-leave guard (react-router blocker + beforeunload) ----
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draft.isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setConfirmLeave(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!draft.isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.isDirty]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        draft.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        draft.redo();
      } else if (e.key === "p" && mode !== "new" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPreviewMode((v) => !v);
      } else if (e.key === "Escape" && mode === "new") {
        e.preventDefault();
        setDrawingPoints([]);
        setMode("select");
      } else if (e.key === "Enter" && mode === "new" && drawingPoints.length >= 3) {
        e.preventDefault();
        finalizeDrawing();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // finalizeDrawing closes over drawingPoints + selectedSlug; the deps
    // here are intentionally narrow to avoid binding a stale finalize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, drawingPoints.length, draft.undo, draft.redo]);

  // ---- Drawing helpers ----
  const startDrawing = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setMode("new");
    setDrawingPoints([]);
    setPreviewMode(false);
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
    setMode("select");
  }, []);

  const finalizeDrawing = useCallback(() => {
    if (!selectedSlug || drawingPoints.length < 3) return;
    draft.setPolygon(selectedSlug, tuplesToObjects(drawingPoints));
    setDrawingPoints([]);
    setMode("select");
  }, [selectedSlug, drawingPoints, draft]);

  // ---- Canvas event handlers ----
  const handleAppendVertex = useCallback((pt: [number, number]) => {
    setDrawingPoints((prev) => [...prev, pt]);
  }, []);

  const handleCloseNewPolygon = useCallback(() => {
    finalizeDrawing();
  }, [finalizeDrawing]);

  const handleUpdateZonePoints = useCallback(
    (slug: string, pts: Array<[number, number]>) => {
      draft.setPolygon(slug, tuplesToObjects(pts));
    },
    [draft],
  );

  const handleSelectZoneFromCanvas = useCallback((slug: string | null) => {
    if (slug) setSelectedSlug(slug);
  }, []);

  // ---- Left rail click handlers ----
  const handleSelectFilledZone = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setMode("select");
    setPreviewMode(false);
  }, []);

  // ---- Action bar handlers ----
  const handleClearSelected = useCallback(() => {
    if (!selectedSlug) return;
    draft.clearPolygon(selectedSlug);
  }, [selectedSlug, draft]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    if (!mapDetail || !draft.isDirty) return;
    const updates: ZonePolygonUpdate[] = Array.from(draft.dirtySlugs).map((slug) => ({
      slug,
      polygon_points: draft.zones[slug] ?? [],
    }));
    try {
      const result = await bulkUpdate({
        mapId: mapDetail.id,
        body: { zones: updates },
      }).unwrap();
      if (result.failed.length > 0) {
        const failedDetail = result.failed.map((f) => `${f.slug} (${f.reason})`).join(", ");
        showError(`Saved ${result.updated.length}; failed: ${failedDetail}`);
        // Don't markSaved — partial-success leaves draft dirty for the
        // failed zones so the operator can see + fix them.
        return;
      }
      draft.markSaved();
      void refetchMapDetail();
      showSuccess(`Saved ${result.updated.length} zone${result.updated.length !== 1 ? "s" : ""}.`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      showError(`Save failed: ${m}`);
    }
  }, [mapDetail, draft, bulkUpdate, refetchMapDetail]);

  const handleDiscardConfirmed = useCallback(() => {
    draft.discardChanges();
    setMode("select");
    setDrawingPoints([]);
    setConfirmDiscard(false);
  }, [draft]);

  // ---- Action bar mode derivation ----
  const actionBarMode: ActionBarMode = useMemo(() => {
    if (!selectedSlug) return null;
    if (mode === "new") return "cancel";
    const points = draft.zones[selectedSlug] ?? [];
    if (points.length >= 3) return "clear";
    return "draw";
  }, [selectedSlug, mode, draft.zones]);

  const selectedZone = useMemo(
    () => mapDetail?.zones.find((z) => z.slug === selectedSlug) ?? null,
    [mapDetail, selectedSlug],
  );

  // ---- Loading / error states ----
  if (mapLoading || !draft.ready) {
    return (
      <main className="p-4 sm:p-6 space-y-4">
        <div className="h-10 w-1/3 bg-muted/40 rounded animate-pulse" />
        <div className="h-96 bg-muted/40 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (mapError || !mapDetail) {
    return (
      <main className="p-4 sm:p-6">
        <p className="text-sm text-destructive">Failed to load map. Please refresh.</p>
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-col h-[calc(100vh-3.5rem)]">
        <ZoneEditorTopBar
          gameSlug={gameSlug ?? ""}
          mapSlug={mapSlug ?? ""}
          mapName={mapDetail.name}
          isDirty={draft.isDirty}
          isSaving={isSaving}
          onSave={() => void handleSave()}
          onDiscard={() => setConfirmDiscard(true)}
        />

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <ZoneEditorLeftRail
            zones={mapDetail.zones}
            draftZones={draft.zones}
            dirtySlugs={draft.dirtySlugs}
            selectedSlug={selectedSlug}
            onSelectFilledZone={handleSelectFilledZone}
            onClickEmptyZone={startDrawing}
          />

          <section className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {hintForMode(mode, drawingPoints.length, selectedZone?.name ?? null)}
              </p>
              <button
                type="button"
                onClick={() => setPreviewMode((v) => !v)}
                className="text-xs px-2 py-1 rounded-md border hover:bg-muted/40"
                disabled={mode === "new"}
              >
                {previewMode ? "Back to edit" : "Preview"}
              </button>
            </div>

            <div className="relative max-w-3xl mx-auto">
              {previewMode ? (
                <ZoneEditorPreview
                  serverZones={mapDetail.zones}
                  draftZones={draft.zones}
                  minimapUrl={mapDetail.minimap_url}
                />
              ) : (
                <ZoneEditorCanvas
                  backgroundSrc={mapDetail.minimap_url}
                  backgroundIsFallback={false}
                  zones={canvasZones}
                  selectedSlug={selectedSlug}
                  mode={mode}
                  drawingSlug={mode === "new" ? selectedSlug : null}
                  drawingPoints={drawingPoints}
                  onSelectZone={handleSelectZoneFromCanvas}
                  onUpdateZonePoints={handleUpdateZonePoints}
                  onAppendNewVertex={handleAppendVertex}
                  onCloseNewPolygon={handleCloseNewPolygon}
                />
              )}

              {!previewMode && (
                <ZoneEditorActionBar
                  mode={actionBarMode}
                  selectedZoneName={selectedZone?.name ?? null}
                  onDraw={() => selectedSlug && startDrawing(selectedSlug)}
                  onClear={handleClearSelected}
                  onCancel={cancelDrawing}
                />
              )}

              {showCoachmark && mode === "new" && (
                <div
                  className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-sm bg-popover border rounded-lg shadow-lg px-4 py-2.5 text-sm"
                  role="status"
                >
                  <p className="font-medium mb-1">Drawing a polygon</p>
                  <p className="text-xs text-muted-foreground">
                    Click to add vertices. Click the first vertex (or press Enter)
                    to close. Esc cancels.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCoachmark(false)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Got it
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        description="Your in-progress polygons will be lost. This cannot be undone."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={handleDiscardConfirmed}
        onCancel={() => setConfirmDiscard(false)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave with unsaved changes?"
        description="Your in-progress polygons won't be saved."
        confirmLabel="Leave"
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
    </>
  );
}

function hintForMode(
  mode: EditorMode,
  drawingCount: number,
  zoneName: string | null,
): string {
  if (mode === "new") {
    if (drawingCount === 0) {
      return zoneName
        ? `Click to add vertices for ${zoneName}.`
        : "Click to add vertices.";
    }
    if (drawingCount < 3) {
      return `${drawingCount} of 3+ vertices. Keep clicking.`;
    }
    return `${drawingCount} vertices. Click the first vertex or press Enter to close.`;
  }
  if (mode === "select") {
    if (!zoneName) return "Select a zone from the list to edit.";
    return `Editing ${zoneName}. Drag the polygon to move; drag vertices to reshape.`;
  }
  return "";
}

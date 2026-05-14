/**
 * ZonesPanel — Job 2: draw polygons over the minimap region.
 *
 * Layout (>=1024px):
 *   left rail (zone list)  |  center (editor canvas)  |  right rail (properties)
 *
 * Layout (<1024px): vertically stacked.
 *
 * Coordinates the editor mode, the selected zone, the drawing-in-progress
 * buffer, and the preview/edit toggle.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, AlertBox } from "@platform/ui";
import { Eye, EyeOff } from "lucide-react";
import ZoneList from "./ZoneList";
import ZoneEditorCanvas, { type EditorMode } from "./ZoneEditorCanvas";
import ZonePropertiesPanel from "./ZonePropertiesPanel";
import ZoneSyntheticDotPreview from "./ZoneSyntheticDotPreview";
import SectionSaveBar from "../shared/SectionSaveBar";
import type { CvZonePolygon } from "@/types/desktop";

interface ZonesPanelProps {
  zones: CvZonePolygon[];
  loadedZones: CvZonePolygon[];
  /** True when the operator hasn't yet marked the minimap region. */
  regionIsEmpty: boolean;
  /** Backend-registered MapZone slugs for the current map. */
  availableSlugs: string[];
  /** Cropped minimap preview (base64 PNG) OR null when no snapshot
   *  available — caller decides whether to swap in a fallback URL. */
  backgroundSrc: string | null;
  backgroundIsFallback: boolean;
  isDirty: boolean;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZonesChange: (zones: CvZonePolygon[]) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  onGoToRegion: () => void;
}

export default function ZonesPanel({
  zones,
  loadedZones,
  regionIsEmpty,
  availableSlugs,
  backgroundSrc,
  backgroundIsFallback,
  isDirty,
  isSaving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZonesChange,
  onSave,
  onReset,
  onGoToRegion,
}: ZonesPanelProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [previewMode, setPreviewMode] = useState(false);
  const [drawingSlug, setDrawingSlug] = useState<string | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Array<[number, number]>>([]);

  // Auto-select first zone if nothing is selected.
  useEffect(() => {
    if (selectedSlug || zones.length === 0) return;
    setSelectedSlug(zones[0].slug);
  }, [zones, selectedSlug]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.slug === selectedSlug) ?? null,
    [zones, selectedSlug],
  );

  const updateZonePoints = useCallback(
    (slug: string, points: Array<[number, number]>) => {
      onZonesChange(
        zones.map((z) => (z.slug === slug ? { ...z, points } : z)),
      );
    },
    [zones, onZonesChange],
  );

  const updateZoneSlug = useCallback(
    (oldSlug: string, newSlug: string) => {
      // Disallow empty or duplicate slugs (would corrupt the dataset).
      if (!newSlug) return;
      if (zones.some((z) => z.slug === newSlug && z.slug !== oldSlug)) return;
      onZonesChange(
        zones.map((z) =>
          z.slug === oldSlug ? { ...z, slug: newSlug } : z,
        ),
      );
      setSelectedSlug(newSlug);
    },
    [zones, onZonesChange],
  );

  const updateZoneName = useCallback(
    (slug: string, name: string) => {
      onZonesChange(
        zones.map((z) => (z.slug === slug ? { ...z, name } : z)),
      );
    },
    [zones, onZonesChange],
  );

  const deleteZone = useCallback(
    (slug: string) => {
      onZonesChange(zones.filter((z) => z.slug !== slug));
      if (selectedSlug === slug) setSelectedSlug(null);
    },
    [zones, onZonesChange, selectedSlug],
  );

  const startNewPolygon = useCallback(() => {
    const slug = nextAvailableSlug(zones);
    setDrawingSlug(slug);
    setDrawingPoints([]);
    setMode("new");
    setSelectedSlug(null);
  }, [zones]);

  const appendNewVertex = useCallback((pt: [number, number]) => {
    setDrawingPoints((prev) => [...prev, pt]);
  }, []);

  const closeNewPolygon = useCallback(() => {
    if (!drawingSlug || drawingPoints.length < 3) return;
    const next: CvZonePolygon = {
      slug: drawingSlug,
      name: drawingSlug.replace(/[-_]/g, " "),
      points: drawingPoints,
    };
    onZonesChange([...zones, next]);
    setDrawingSlug(null);
    setDrawingPoints([]);
    setSelectedSlug(next.slug);
    setMode("select");
  }, [drawingSlug, drawingPoints, zones, onZonesChange]);

  // Keyboard shortcuts: v/n/del/enter/p
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "v") {
        e.preventDefault();
        setMode("add-vertex");
      } else if (e.key === "n") {
        e.preventDefault();
        startNewPolygon();
      } else if (e.key === "p") {
        e.preventDefault();
        setPreviewMode((p) => !p);
      } else if (e.key === "Enter" && mode === "new") {
        e.preventDefault();
        closeNewPolygon();
      } else if (e.key === "Escape" && mode === "new") {
        e.preventDefault();
        setDrawingSlug(null);
        setDrawingPoints([]);
        setMode("select");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, startNewPolygon, closeNewPolygon]);

  if (regionIsEmpty) {
    return (
      <div className="space-y-4">
        <AlertBox variant="info">
          <div className="space-y-2">
            <p>
              <strong>Set your minimap region first.</strong> The zone editor
              draws on top of the region you marked in the Region tab.
            </p>
            <Button size="sm" onClick={onGoToRegion}>
              Go to Region
            </Button>
          </div>
        </AlertBox>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] gap-4 items-start">
        <ZoneList
          zones={zones}
          loadedZones={loadedZones}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          onNewZone={startNewPolygon}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {modeHint(mode)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewMode((p) => !p)}
              data-testid="zones-preview-toggle"
            >
              {previewMode ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1" aria-hidden />
                  Back to edit
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1" aria-hidden />
                  Preview
                </>
              )}
            </Button>
          </div>

          {previewMode ? (
            <Card title="Synthetic dot preview">
              <ZoneSyntheticDotPreview zones={zones} />
            </Card>
          ) : (
            <ZoneEditorCanvas
              backgroundSrc={backgroundSrc}
              backgroundIsFallback={backgroundIsFallback}
              zones={zones}
              selectedSlug={selectedSlug}
              mode={mode}
              drawingSlug={drawingSlug}
              drawingPoints={drawingPoints}
              onSelectZone={setSelectedSlug}
              onUpdateZonePoints={updateZonePoints}
              onAppendNewVertex={appendNewVertex}
              onCloseNewPolygon={closeNewPolygon}
            />
          )}
        </div>

        <ZonePropertiesPanel
          zone={selectedZone}
          availableSlugs={availableSlugs}
          mode={mode}
          onUpdateSlug={updateZoneSlug}
          onUpdateName={updateZoneName}
          onDeleteZone={deleteZone}
          onSetMode={setMode}
          onStartNewPolygon={startNewPolygon}
        />
      </div>

      <SectionSaveBar
        section="zones"
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={onSave}
        onReset={onReset}
      >
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo}>
          Undo
        </Button>
        <Button variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo}>
          Redo
        </Button>
      </SectionSaveBar>
    </div>
  );
}

function modeHint(mode: EditorMode): string {
  switch (mode) {
    case "idle":
      return "Hover a polygon to highlight it. Click to select.";
    case "select":
      return "Drag the polygon body to move, vertices to reshape. Arrow keys nudge.";
    case "add-vertex":
      return "Click an edge to insert a new vertex.";
    case "new":
      return "Click the canvas to add vertices. Click the first vertex (or press Enter) to close.";
    default:
      return "";
  }
}

function nextAvailableSlug(zones: CvZonePolygon[]): string {
  let n = zones.length + 1;
  while (zones.some((z) => z.slug === `zone-${n}`)) n += 1;
  return `zone-${n}`;
}

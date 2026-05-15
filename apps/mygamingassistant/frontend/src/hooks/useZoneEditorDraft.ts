/**
 * useZoneEditorDraft — local draft state for the plan-mode zone editor.
 *
 * Responsibilities:
 *  - Hold an editable `Record<slug, PointObject[]>` snapshot of the map's
 *    zone polygons, initialized from the server-loaded zones.
 *  - Persist the draft to localStorage keyed by `mga_zone_draft_<mapId>`
 *    so an accidental tab close or session timeout doesn't lose 30 min of
 *    work (the design review flagged this as worth the ~20 lines).
 *  - Undo/redo via a simple snapshot stack.
 *  - Compute `isDirty` and per-slug `dirtySlugs` against the server
 *    baseline so the editor can show which zones still need saving.
 *  - Discard restores baseline + clears localStorage.
 *
 * The hook does NOT own the save mutation — callers wire it up so they
 * can pass loading state to the Save Bar and handle partial failures
 * cleanly. After a successful save the caller MUST call `markSaved()` to
 * reset the baseline and clear localStorage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapZone } from "@/types/game";
import type { PointObject } from "@/lib/zonePolygon";

const STORAGE_KEY_PREFIX = "mga_zone_draft_";
const STORAGE_VERSION = 1;

type ZoneMap = Record<string, PointObject[]>;

interface StoredDraft {
  __version: number;
  mapId: string;
  zones: ZoneMap;
}

function storageKey(mapId: string): string {
  return `${STORAGE_KEY_PREFIX}${mapId}`;
}

function readStoredDraft(mapId: string): ZoneMap | null {
  try {
    const raw = localStorage.getItem(storageKey(mapId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (parsed.__version !== STORAGE_VERSION) return null;
    if (parsed.mapId !== mapId) return null;
    return parsed.zones;
  } catch {
    // Quota exceeded / disabled / malformed JSON — fall back to server state.
    return null;
  }
}

function writeStoredDraft(mapId: string, zones: ZoneMap): void {
  try {
    const entry: StoredDraft = {
      __version: STORAGE_VERSION,
      mapId,
      zones,
    };
    localStorage.setItem(storageKey(mapId), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — silently fall through. Worst
    // case the operator loses the draft on tab close, which matches the
    // pre-draft-persistence behavior.
  }
}

function clearStoredDraft(mapId: string): void {
  try {
    localStorage.removeItem(storageKey(mapId));
  } catch {
    // ignore
  }
}

function zonesToMap(zones: MapZone[]): ZoneMap {
  const out: ZoneMap = {};
  for (const z of zones) {
    out[z.slug] = z.polygon_points;
  }
  return out;
}

// Stable JSON shape — keys sorted — so dirty checks don't flicker on
// JS Object property-order differences.
function hash(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

export interface UseZoneEditorDraftArgs {
  mapId: string | undefined;
  /** Server-loaded zones — undefined while the map detail query is in flight. */
  serverZones: MapZone[] | undefined;
}

export interface ZoneEditorDraft {
  zones: ZoneMap;
  /** Convenience read for one zone's polygon. */
  getPolygon: (slug: string) => PointObject[];
  setPolygon: (slug: string, points: PointObject[]) => void;
  clearPolygon: (slug: string) => void;
  /** Discard the draft and revert to the server baseline. */
  discardChanges: () => void;
  /** Tell the hook "the server now reflects the current draft" — clears
   *  localStorage and updates the baseline so isDirty becomes false. */
  markSaved: () => void;
  isDirty: boolean;
  dirtySlugs: Set<string>;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** True after the first server load has hydrated the draft. False while
   *  the parent query is in flight. */
  ready: boolean;
  /** True if a localStorage draft was restored on init (used to surface a
   *  one-time "We restored your in-progress draft" toast). */
  restoredFromStorage: boolean;
}

export function useZoneEditorDraft({
  mapId,
  serverZones,
}: UseZoneEditorDraftArgs): ZoneEditorDraft {
  const [zones, setZones] = useState<ZoneMap>({});
  const [baseline, setBaseline] = useState<ZoneMap>({});
  const [undoStack, setUndoStack] = useState<ZoneMap[]>([]);
  const [redoStack, setRedoStack] = useState<ZoneMap[]>([]);
  const [ready, setReady] = useState(false);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  // Initialize once when both mapId and serverZones are available.
  // useRef guards against double-init on re-renders.
  const initRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapId || !serverZones) return;
    if (initRef.current === mapId) return;
    initRef.current = mapId;

    const server = zonesToMap(serverZones);
    const stored = readStoredDraft(mapId);
    if (stored) {
      // Only treat as a real restored draft if it actually differs from
      // the server state. Otherwise it's just stale data to ignore.
      const meaningful = hash(stored) !== hash(server);
      if (meaningful) {
        setZones(stored);
        setRestoredFromStorage(true);
      } else {
        setZones(server);
        clearStoredDraft(mapId);
      }
    } else {
      setZones(server);
    }
    setBaseline(server);
    setReady(true);
  }, [mapId, serverZones]);

  // Persist to localStorage on every change (but not during initial hydration).
  useEffect(() => {
    if (!mapId || !ready) return;
    if (hash(zones) === hash(baseline)) {
      // Draft matches baseline — no point storing.
      clearStoredDraft(mapId);
      return;
    }
    writeStoredDraft(mapId, zones);
  }, [mapId, zones, baseline, ready]);

  const pushUndo = useCallback((prev: ZoneMap) => {
    setUndoStack((stack) => [...stack, prev]);
    setRedoStack([]);
  }, []);

  const setPolygon = useCallback(
    (slug: string, points: PointObject[]) => {
      setZones((prev) => {
        pushUndo(prev);
        return { ...prev, [slug]: points };
      });
    },
    [pushUndo],
  );

  const clearPolygon = useCallback(
    (slug: string) => {
      setZones((prev) => {
        pushUndo(prev);
        return { ...prev, [slug]: [] };
      });
    },
    [pushUndo],
  );

  const discardChanges = useCallback(() => {
    if (!mapId) return;
    setZones(baseline);
    setUndoStack([]);
    setRedoStack([]);
    clearStoredDraft(mapId);
    setRestoredFromStorage(false);
  }, [baseline, mapId]);

  const markSaved = useCallback(() => {
    if (!mapId) return;
    setBaseline(zones);
    setUndoStack([]);
    setRedoStack([]);
    clearStoredDraft(mapId);
    setRestoredFromStorage(false);
  }, [zones, mapId]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const last = stack[stack.length - 1];
      setRedoStack((r) => [...r, zones]);
      setZones(last);
      return stack.slice(0, -1);
    });
  }, [zones]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [...u, zones]);
      setZones(next);
      return stack.slice(0, -1);
    });
  }, [zones]);

  const dirtySlugs = useMemo(() => {
    const out = new Set<string>();
    const allSlugs = new Set([
      ...Object.keys(zones),
      ...Object.keys(baseline),
    ]);
    for (const slug of allSlugs) {
      if (hash(zones[slug] ?? []) !== hash(baseline[slug] ?? [])) {
        out.add(slug);
      }
    }
    return out;
  }, [zones, baseline]);

  const isDirty = dirtySlugs.size > 0;

  const getPolygon = useCallback(
    (slug: string): PointObject[] => zones[slug] ?? [],
    [zones],
  );

  return {
    zones,
    getPolygon,
    setPolygon,
    clearPolygon,
    discardChanges,
    markSaved,
    isDirty,
    dirtySlugs,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    ready,
    restoredFromStorage,
  };
}

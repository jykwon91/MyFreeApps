/**
 * useCalibrationDraft — central reducer for the calibration editor (PR 9b).
 *
 * Owns:
 *   - Loaded baseline (last-saved JSON) — used for diff + reset.
 *   - Draft (working copy of the calibration + zones).
 *   - Dirty flags per section (region / zones / dots).
 *   - Undo / redo stack (bounded; default 30 entries).
 *
 * Does NOT own:
 *   - Map / resolution selection — the page shell does that and tells
 *     the hook which (map, res) to load.
 *   - Live preview hot-swap — that goes through `cv_set_dot_params_preview`
 *     directly from `DotsPanel`; the hook handles persistence only.
 *
 * Save path: each section saves independently. We send the FULL current draft
 * to `cv_set_calibration` because the IPC contract takes a full package; the
 * Rust side just writes whatever the operator submitted. The dirty flag for
 * the saved section flips false; other sections remain dirty if they were.
 */
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import {
  captureRegionsEqual,
  computeDirtySections,
  dotParamsEqual,
  worldTransformFromRegion,
  zoneListsEqual,
} from "@/lib/calibration";
import type {
  CalibrationSource,
  CvCaptureRegion,
  CvDotDetectionParams,
  CvMapCalibrationPackage,
  CvResetCalibrationResult,
  CvZonePolygon,
} from "@/types/desktop";
import { emptyCalibrationPackage } from "@/lib/calibration";

export interface CalibrationDraftState {
  /** Last-saved baseline. Null until first load completes. */
  loaded: CvMapCalibrationPackage | null;
  /** Working copy of the calibration. Null until first load completes. */
  draft: CvMapCalibrationPackage | null;
  isLoading: boolean;
  loadError: string | null;
  source: CalibrationSource;
}

type DraftAction =
  | { type: "load:start" }
  | {
      type: "load:success";
      pkg: CvMapCalibrationPackage | null;
      source: CalibrationSource;
    }
  | { type: "load:error"; message: string }
  | { type: "set:region"; region: CvCaptureRegion }
  | { type: "set:dot"; params: CvDotDetectionParams }
  | { type: "set:zones"; zones: CvZonePolygon[] }
  | { type: "save:section"; section: "region" | "zones" | "dots" }
  | { type: "reset:section"; section: "region" | "zones" | "dots" }
  | { type: "reset:bundled" }
  | { type: "undo" }
  | { type: "redo" };

/** Reducer state — wraps the draft state with an undo / redo stack. */
interface InternalState extends CalibrationDraftState {
  past: CvMapCalibrationPackage[];
  future: CvMapCalibrationPackage[];
}

const UNDO_STACK_MAX = 30;

function initial(): InternalState {
  return {
    loaded: null,
    draft: null,
    isLoading: true,
    loadError: null,
    source: "unknown",
    past: [],
    future: [],
  };
}

/**
 * Push the current draft onto the undo stack before applying a new edit.
 * Drops the redo stack — once you make a fresh edit, redo no longer makes
 * sense. Bounded by `UNDO_STACK_MAX`.
 */
function pushUndo(
  state: InternalState,
  next: CvMapCalibrationPackage,
): InternalState {
  if (!state.draft) {
    return { ...state, draft: next };
  }
  const past = [...state.past, state.draft].slice(-UNDO_STACK_MAX);
  return { ...state, past, future: [], draft: next };
}

function reducer(state: InternalState, action: DraftAction): InternalState {
  switch (action.type) {
    case "load:start":
      return { ...state, isLoading: true, loadError: null };

    case "load:success":
      return {
        ...state,
        isLoading: false,
        loadError: null,
        loaded: action.pkg,
        draft: action.pkg,
        source: action.source,
        past: [],
        future: [],
      };

    case "load:error":
      return {
        ...state,
        isLoading: false,
        loadError: action.message,
        loaded: null,
        draft: null,
        source: "unknown",
      };

    case "set:region": {
      if (!state.draft) return state;
      // Re-derive world transform from the new region (axis-aligned per
      // PR 9b spec). Operators who want manual control can edit the
      // world_transform via cv_set_calibration directly, not the UI.
      const newCalibration = {
        ...state.draft.calibration,
        minimap_region: action.region,
        world_transform: worldTransformFromRegion(action.region),
      };
      return pushUndo(state, {
        ...state.draft,
        calibration: newCalibration,
      });
    }

    case "set:dot": {
      if (!state.draft) return state;
      return pushUndo(state, {
        ...state.draft,
        calibration: { ...state.draft.calibration, dot_detection: action.params },
      });
    }

    case "set:zones": {
      if (!state.draft) return state;
      return pushUndo(state, { ...state.draft, zones: action.zones });
    }

    case "save:section": {
      // Mirror the saved section into `loaded` so dirty flips false. Other
      // sections preserve their dirty state.
      if (!state.draft || !state.loaded) return state;
      let nextLoaded = state.loaded;
      if (action.section === "region") {
        nextLoaded = {
          ...nextLoaded,
          calibration: {
            ...nextLoaded.calibration,
            minimap_region: state.draft.calibration.minimap_region,
            world_transform: state.draft.calibration.world_transform,
          },
        };
      } else if (action.section === "dots") {
        nextLoaded = {
          ...nextLoaded,
          calibration: {
            ...nextLoaded.calibration,
            dot_detection: state.draft.calibration.dot_detection,
          },
        };
      } else if (action.section === "zones") {
        nextLoaded = { ...nextLoaded, zones: state.draft.zones };
      }
      return {
        ...state,
        loaded: nextLoaded,
        // Saving promotes the draft → user has explicitly committed; source
        // is now an override (unless we just persisted the bundled value
        // unchanged, but that's harmless — the file just matches the bundle).
        source: "override",
      };
    }

    case "reset:section": {
      if (!state.draft || !state.loaded) return state;
      const draft = state.draft;
      const loaded = state.loaded;
      let next: CvMapCalibrationPackage = draft;
      if (action.section === "region") {
        next = {
          ...draft,
          calibration: {
            ...draft.calibration,
            minimap_region: loaded.calibration.minimap_region,
            world_transform: loaded.calibration.world_transform,
          },
        };
      } else if (action.section === "dots") {
        next = {
          ...draft,
          calibration: {
            ...draft.calibration,
            dot_detection: loaded.calibration.dot_detection,
          },
        };
      } else if (action.section === "zones") {
        next = { ...draft, zones: loaded.zones };
      }
      return pushUndo(state, next);
    }

    case "reset:bundled": {
      // Treated as a load-success with source=bundled — the caller is
      // responsible for actually deleting the override file before
      // dispatching this action.
      return { ...state, source: "bundled" };
    }

    case "undo": {
      if (state.past.length === 0 || !state.draft) return state;
      const prev = state.past[state.past.length - 1];
      const past = state.past.slice(0, -1);
      const future = [state.draft, ...state.future].slice(0, UNDO_STACK_MAX);
      return { ...state, past, future, draft: prev };
    }

    case "redo": {
      if (state.future.length === 0 || !state.draft) return state;
      const [next, ...rest] = state.future;
      const past = [...state.past, state.draft].slice(-UNDO_STACK_MAX);
      return { ...state, past, future: rest, draft: next };
    }

    default:
      return state;
  }
}

export interface UseCalibrationDraft {
  state: CalibrationDraftState;
  /** Force-reload the calibration from disk. Useful after external file edits. */
  reload: () => Promise<void>;
  setRegion: (region: CvCaptureRegion) => void;
  setDot: (params: CvDotDetectionParams) => void;
  setZones: (zones: CvZonePolygon[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Per-section dirty flags — true when draft differs from baseline. */
  dirtySections: { region: boolean; zones: boolean; dots: boolean };
  /** Save the named section to disk via `cv_set_calibration`. Throws on IPC failure. */
  saveSection: (section: "region" | "zones" | "dots") => Promise<void>;
  resetSection: (section: "region" | "zones" | "dots") => void;
  /** Delete the override file + reload bundled (or empty) for this (map, res). */
  resetToBundled: () => Promise<void>;
}

interface UseCalibrationDraftArgs {
  mapSlug: string;
  resolution: string;
}

/**
 * Hook-level driver. Re-loads from disk on (map, resolution) change.
 *
 * Resolution priority on load:
 *   1. Operator override (`<app_config_dir>/cv_calibrations/<slug>_<res>.json`)
 *   2. Bundled default
 *   3. `null` (UI surfaces the "no calibration yet" empty state)
 */
export function useCalibrationDraft({
  mapSlug,
  resolution,
}: UseCalibrationDraftArgs): UseCalibrationDraft {
  const [internal, dispatch] = useReducer(reducer, undefined, initial);

  const reload = useCallback(async () => {
    if (!isTauri()) {
      // Web: no calibration to load. Stay in the disabled state.
      dispatch({ type: "load:success", pkg: null, source: "unknown" });
      return;
    }
    if (!mapSlug || !resolution) {
      dispatch({ type: "load:success", pkg: null, source: "unknown" });
      return;
    }
    dispatch({ type: "load:start" });
    try {
      const pkg = await invokeTauri<CvMapCalibrationPackage | null>(
        "cv_get_calibration",
        { mapSlug, resolution },
      );
      if (!pkg) {
        // No bundled OR override for this (map, res). Seed an empty draft
        // so the operator can start editing — `loaded` stays null so the
        // dirty diff says "everything is edited" once they touch anything.
        const empty = emptyCalibrationPackage(mapSlug, resolution);
        dispatch({ type: "load:success", pkg: empty, source: "unknown" });
        return;
      }
      // We don't have a clean Tauri-side signal for bundled-vs-override; the
      // command returns the override if present, else the bundled. Best-effort
      // detect: any change implies an override exists.
      // Simpler approach: assume bundled until the next save promotes the
      // source. This matches what the operator expects on first open.
      dispatch({ type: "load:success", pkg, source: "bundled" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      dispatch({ type: "load:error", message });
    }
  }, [mapSlug, resolution]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setRegion = useCallback(
    (region: CvCaptureRegion) => dispatch({ type: "set:region", region }),
    [],
  );
  const setDot = useCallback(
    (params: CvDotDetectionParams) => dispatch({ type: "set:dot", params }),
    [],
  );
  const setZones = useCallback(
    (zones: CvZonePolygon[]) => dispatch({ type: "set:zones", zones }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const resetSection = useCallback(
    (section: "region" | "zones" | "dots") =>
      dispatch({ type: "reset:section", section }),
    [],
  );

  const saveSection = useCallback(
    async (section: "region" | "zones" | "dots") => {
      if (!internal.draft) return;
      if (!isTauri()) return;
      // We always write the full draft package — `cv_set_calibration`'s
      // IPC contract takes the whole package. The Rust side overwrites
      // the override JSON; the UI tracks per-section dirty flags via the
      // reducer's `save:section` action below.
      await invokeTauri<string>("cv_set_calibration", {
        pkg: internal.draft,
        resolution,
      });
      dispatch({ type: "save:section", section });
    },
    [internal.draft, resolution],
  );

  const resetToBundled = useCallback(async () => {
    if (!isTauri() || !mapSlug || !resolution) return;
    await invokeTauri<CvResetCalibrationResult>("cv_reset_calibration", {
      mapSlug,
      resolution,
    });
    await reload();
  }, [mapSlug, resolution, reload]);

  const dirtySections = useMemo(() => {
    return computeDirtySections(
      internal.loaded,
      internal.draft?.calibration ?? null,
      internal.draft?.zones ?? null,
    );
  }, [internal.loaded, internal.draft]);

  const externalState: CalibrationDraftState = useMemo(
    () => ({
      loaded: internal.loaded,
      draft: internal.draft,
      isLoading: internal.isLoading,
      loadError: internal.loadError,
      source: internal.source,
    }),
    [internal.loaded, internal.draft, internal.isLoading, internal.loadError, internal.source],
  );

  return {
    state: externalState,
    reload,
    setRegion,
    setDot,
    setZones,
    undo,
    redo,
    canUndo: internal.past.length > 0,
    canRedo: internal.future.length > 0,
    dirtySections,
    saveSection,
    resetSection,
    resetToBundled,
  };
}

// Re-export the deep equal helpers for tests + advanced UI uses (e.g. the
// region indicator showing "matches bundled default exactly").
export { captureRegionsEqual, dotParamsEqual, zoneListsEqual };

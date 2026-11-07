import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_MARKS_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/mapMarks";
import { DEFAULT_MAP_MARK_STYLE, markStyleDef, type MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import { newMarkId } from "@/games/wow-forever/lib/newMarkId";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import type { MapMarksStore } from "@/games/wow-forever/types/mapMarks/mapMarksStore";
import type { SavedSharedMarks } from "@/games/wow-forever/types/mapMarks/savedSharedMarks";
import type { MapMarksUndo } from "@/games/wow-forever/types/mapMarks/mapMarksUndo";
import {
  EMPTY_MAP_MARKS_STORE,
  addMark,
  addToRoute,
  clearRoute,
  deleteMark,
  marksOn,
  moveRouteStop,
  parseMapMarksStore,
  removeRouteStop,
  restoreMapMarks,
  roomForMarks,
  saveSharedMarks,
  updateMark,
} from "@/games/wow-forever/worldMap/mapMarks";

export interface MapMarksState {
  /** The viewed map's marks and route. */
  marks: MapMarks;
  /** How many more marks the viewed map can take. */
  room: number;
  /** A new mark at (x, y) on the viewed map; null when it's full. */
  add: (x: number, y: number, style?: MapMarkStyle) => string | null;
  update: (id: string, patch: { label?: string; style?: MapMarkStyle }) => void;
  remove: (id: string) => void;
  addToRoute: (id: string) => void;
  removeStop: (index: number) => void;
  moveStop: (index: number, delta: number) => void;
  clearRoute: () => void;
  /** The last delete / clear, until undone or replaced. */
  undo: MapMarksUndo | null;
  applyUndo: () => void;
  dismissUndo: () => void;
  /** Add a shared view's marks to yours on that map (never replacing any). */
  saveShared: (mapId: number, shared: MapMarks) => SavedSharedMarks;
}

function readStore(): MapMarksStore {
  return readStored(MAP_MARKS_STORAGE_KEY, parseMapMarksStore, EMPTY_MAP_MARKS_STORE);
}

/**
 * The player's own marks and routes, per map, in this browser only
 * (`mga.wowForever.worldMap.marks.v1`). Nothing is written until something
 * changes; another tab's save is picked up from the `storage` event. Every
 * edit starts from the newest store (a ref), so two quick edits never drop one.
 */
export function useMapMarks(mapId: number | null): MapMarksState {
  const [store, setStore] = useState<MapMarksStore>(readStore);
  const latest = useRef(store);
  const [undo, setUndo] = useState<MapMarksUndo | null>(null);

  useEffect(() => {
    function reload(e: StorageEvent) {
      if (e.key !== MAP_MARKS_STORAGE_KEY) return;
      latest.current = readStore();
      setStore(latest.current);
    }
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

  const commit = useCallback((next: MapMarksStore) => {
    if (next === latest.current) return;
    latest.current = next;
    setStore(next);
    writeStored(MAP_MARKS_STORAGE_KEY, next);
  }, []);

  const edit = useCallback(
    (change: (s: MapMarksStore, id: number) => MapMarksStore) => {
      if (mapId !== null) commit(change(latest.current, mapId));
    },
    [mapId, commit],
  );

  const add = useCallback(
    (x: number, y: number, style: MapMarkStyle = DEFAULT_MAP_MARK_STYLE) => {
      if (mapId === null || roomForMarks(latest.current, mapId) === 0) return null;
      const id = newMarkId();
      commit(addMark(latest.current, mapId, { id, x, y, style, label: markStyleDef(style).defaultLabel }));
      return id;
    },
    [mapId, commit],
  );

  const remove = useCallback(
    (id: string) => {
      if (mapId === null) return;
      const before = marksOn(latest.current, mapId);
      const mark = before.marks.find((m) => m.id === id);
      if (!mark) return;
      commit(deleteMark(latest.current, mapId, id));
      setUndo({ mapId, marks: before, message: `Deleted “${mark.label}”` });
    },
    [mapId, commit],
  );

  const clear = useCallback(() => {
    if (mapId === null) return;
    const before = marksOn(latest.current, mapId);
    if (before.route.length === 0) return;
    commit(clearRoute(latest.current, mapId));
    setUndo({ mapId, marks: before, message: "Route cleared" });
  }, [mapId, commit]);

  const applyUndo = useCallback(() => {
    if (!undo) return;
    commit(restoreMapMarks(latest.current, undo.mapId, undo.marks));
    setUndo(null);
  }, [undo, commit]);

  const saveShared = useCallback(
    (target: number, shared: MapMarks) => {
      const result = saveSharedMarks(latest.current, target, shared, newMarkId);
      commit(result.store);
      return result;
    },
    [commit],
  );

  return {
    marks: mapId === null ? marksOn(EMPTY_MAP_MARKS_STORE, 0) : marksOn(store, mapId),
    room: mapId === null ? 0 : roomForMarks(store, mapId),
    add,
    update: (id, patch) => edit((s, m) => updateMark(s, m, id, patch)),
    remove,
    addToRoute: (id) => edit((s, m) => addToRoute(s, m, id)),
    removeStop: (index) => edit((s, m) => removeRouteStop(s, m, index)),
    moveStop: (index, delta) => edit((s, m) => moveRouteStop(s, m, index, delta)),
    clearRoute: clear,
    undo,
    applyUndo,
    dismissUndo: () => setUndo(null),
    saveShared,
  };
}

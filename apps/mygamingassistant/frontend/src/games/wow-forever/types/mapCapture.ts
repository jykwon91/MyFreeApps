import type { Faction, PoiKind, PoiSubkind } from "@/games/wow-forever/types/worldMap";

/**
 * World Map captures as the API sends and receives them — mirrors
 * `backend/app/schemas/wow/map_capture.py` (snake_case like the rest of the API).
 */
export interface CapturedQuest {
  id?: number | null;
  title: string;
  level: number;
  min_level: number;
}

export interface MapCapture {
  capture_key: string;
  kind: PoiKind;
  subkind: PoiSubkind;
  tag: string;
  npc_id?: number | null;
  name: string;
  title: string;
  zone_id: number;
  subzone: string;
  x: number;
  y: number;
  faction: Faction;
  quests?: CapturedQuest[] | null;
  /** ISO 8601. */
  captured_at: string;
}

export interface MapCaptureList {
  captures: MapCapture[];
}

export interface MapCaptureImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

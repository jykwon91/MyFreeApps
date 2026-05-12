export interface Game {
  id: string;
  slug: string;
  name: string;
  side_a_label: string;
  side_b_label: string;
}

export interface GameMap {
  id: string;
  slug: string;
  name: string;
  minimap_url: string | null;
}

export interface MapZone {
  id: string;
  slug: string;
  name: string;
  /** Normalized 0-1 coordinates relative to the minimap dimensions. */
  polygon_points: Array<{ x: number; y: number }>;
}

export interface MapSite {
  id: string;
  slug: string;
  name: string;
}

export interface UtilityType {
  id: string;
  slug: string;
  name: string;
}

export interface MapDetail {
  id: string;
  slug: string;
  name: string;
  minimap_url: string | null;
  zones: MapZone[];
  sites: MapSite[];
  utility_types: UtilityType[];
}

// ---------------------------------------------------------------------------
// Lineup domain
// ---------------------------------------------------------------------------

export interface ZoneRead {
  id: string;
  slug: string;
  name: string;
  polygon_points: Array<{ x: number; y: number }>;
}

export interface UtilityTypeRead {
  id: string;
  slug: string;
  name: string;
}

export interface Lineup {
  id: string;
  game_id: string;
  map_id: string;
  target_zone_id: string | null;
  stand_zone_id: string | null;
  side: "side_a" | "side_b" | "any" | null;
  utility_type_id: string | null;
  title: string;
  notes: string | null;
  stand_screenshot_url: string | null;
  aim_screenshot_url: string | null;
  aim_anchor_x: number | null;
  aim_anchor_y: number | null;
  setup_seconds: number | null;
  attribution_url: string | null;
  attribution_author: string | null;
  status: "accepted" | "pending_review" | "hidden";
  // YouTube ingestion metadata
  youtube_video_id: string | null;
  chapter_start_seconds: number | null;
  chapter_title: string | null;
  // Classifier suggestions (PR 5)
  suggested_game_id: string | null;
  suggested_map_id: string | null;
  suggested_target_zone_id: string | null;
  suggested_stand_zone_id: string | null;
  suggested_side: "side_a" | "side_b" | "any" | null;
  suggested_utility_type_id: string | null;
  classification_confidence: number | null;
  classification_reasoning: string | null;
  target_zone: ZoneRead | null;
  stand_zone: ZoneRead | null;
  utility_type: UtilityTypeRead | null;
}

export interface PendingLineupsResponse {
  items: Lineup[];
  total: number;
  limit: number;
  offset: number;
}

export interface LineupAcceptBody {
  game_id?: string;
  map_id?: string;
  target_zone_id?: string;
  stand_zone_id?: string;
  side?: "side_a" | "side_b" | "any";
  utility_type_id?: string;
  title?: string;
  notes?: string;
  aim_anchor_x?: number;
  aim_anchor_y?: number;
  setup_seconds?: number;
}

export interface BulkAcceptBody {
  lineup_ids: string[];
  patches: Record<string, LineupAcceptBody>;
}

export interface ClassifyResponse {
  lineup_id: string;
  success: boolean;
  suggested_game_id: string | null;
  suggested_map_id: string | null;
  suggested_target_zone_id: string | null;
  suggested_stand_zone_id: string | null;
  suggested_side: "side_a" | "side_b" | "any" | null;
  suggested_utility_type_id: string | null;
  aim_anchor_x: number | null;
  aim_anchor_y: number | null;
  confidence: number | null;
  reasoning: string;
  error_codes: string[];
}

export interface UploadUrlResponse {
  lineup_id: string;
  stand_upload_url: string;
  aim_upload_url: string;
  stand_object_key: string;
  aim_object_key: string;
}

export interface LineupCreate {
  game_id: string;
  map_id: string;
  target_zone_id: string;
  stand_zone_id: string;
  side: "side_a" | "side_b" | "any";
  utility_type_id: string;
  title: string;
  notes?: string;
  stand_screenshot_key?: string;
  aim_screenshot_key?: string;
  aim_anchor_x?: number;
  aim_anchor_y?: number;
  setup_seconds?: number;
}

export interface LineupPatch {
  target_zone_id?: string;
  stand_zone_id?: string;
  side?: "side_a" | "side_b" | "any";
  utility_type_id?: string;
  title?: string;
  notes?: string;
  aim_anchor_x?: number;
  aim_anchor_y?: number;
  setup_seconds?: number;
}

/** Zone density response shape from /zone-density endpoint. */
export interface ZoneDensity {
  [zoneId: string]: {
    count: number;
    by_utility: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Source domain
// ---------------------------------------------------------------------------

export type SourceKind = "youtube_playlist" | "youtube_channel";

export interface Source {
  id: string;
  kind: SourceKind;
  /** Raw config JSON from the backend — contains url/channel_url, last_sync_stats. */
  config_json: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
}

export interface SourceCreate {
  kind: SourceKind;
  url: string;
}

export interface SyncJobResponse {
  job_id: string;
  source_id: string;
  status: string;
  message: string;
}

/**
 * Shapes returned by Tauri IPC commands + payloads emitted via Tauri events.
 *
 * Keep these in sync with the Rust crate:
 *   - `apps/mygamingassistant/desktop/src-tauri/src/commands.rs`
 *   - `apps/mygamingassistant/desktop/src-tauri/src/gsi/payload.rs`
 *   - `apps/mygamingassistant/desktop/src-tauri/src/gsi/state.rs`
 *   - `apps/mygamingassistant/desktop/src-tauri/src/gsi/installer.rs`
 *
 * Every Rust struct serialized by `serde` has a corresponding TypeScript
 * interface here. Discriminated unions on the Rust side become string
 * literal unions in TS (see `NormalizedSide`).
 */

/** Returned by the `get_app_version` Tauri command. */
export interface AppVersion {
  /** Semver of the desktop binary — matches `Cargo.toml` `[package].version`. */
  version: string;
  /** Build profile the binary was compiled with. */
  build: "debug" | "release";
  /** PR sequence number this version corresponds to. */
  pr: number;
}

// ---------------------------------------------------------------------------
// PR 8 — CS2 GSI receiver
// ---------------------------------------------------------------------------

/**
 * Side enum mirroring `Lineup.side` on the backend.
 *
 * CS2's `T` (Terrorists) → `side_a`, `CT` (Counter-Terrorists) → `side_b`.
 * `any` is the "side unknown" state (menu / spectating).
 */
export type GsiSide = "side_a" | "side_b" | "any";

/**
 * CS2 utility-type slug union. Must stay in lockstep with
 * `apps/mygamingassistant/backend/app/fixtures/utility_types.json` and
 * with the Rust mapping in `desktop/src-tauri/src/gsi/weapons.rs`.
 *
 * MGA uses `grenade` (not `he`) for HE — see fixture for rationale.
 */
export type Cs2UtilitySlug =
  | "smoke"
  | "flash"
  | "molotov"
  | "grenade"
  | "decoy";

/** Display labels for the override panel + HUD. */
export const CS2_UTILITY_LABELS: Record<Cs2UtilitySlug, string> = {
  smoke: "Smoke",
  flash: "Flash",
  molotov: "Molotov",
  grenade: "HE",
  decoy: "Decoy",
};

/** Ordered list of slugs for select dropdowns — keeps "ALL" group ordering
 *  stable so the override menu doesn't shuffle each render. */
export const CS2_UTILITY_SLUGS: Cs2UtilitySlug[] = [
  "smoke",
  "flash",
  "molotov",
  "grenade",
  "decoy",
];

/**
 * Bomb state — one of CS2's three terminal states once the bomb has been
 * touched in a round. `null` when the bomb is in nobody's hand / waiting.
 */
export type BombState = "planted" | "defused" | "exploded";

/**
 * Normalized GSI event payload emitted by the Rust receiver via the Tauri
 * event `gsi:state-update` on every accepted POST from CS2.
 *
 * Matches the `GsiEvent` struct in `src-tauri/src/gsi/payload.rs`. PR 10
 * added explicit typed fields for `money`, `score`, `bomb_state`, and
 * weapon-derived `active_utility` / `held_utility_slugs`.
 */
export interface GsiEvent {
  /**
   * Canonical MGA map slug (e.g., `"mirage"`, NOT `"de_mirage"`). Empty
   * string when no map is loaded (menu state).
   */
  map_slug: string;
  /** `"warmup" | "live" | "intermission" | "gameover" | ""`. */
  map_phase: string;
  /** Local player's side, already normalized to MGA's three-valued enum. */
  side: GsiSide;
  /** `"freezetime" | "live" | "over" | ""`. */
  round_phase: string;
  /** `"playing" | "menu" | "textinput"` etc. */
  activity: string;
  // --- PR 10: explicit, strongly-typed HUD fields ---
  /** Bomb state (`"planted" | "defused" | "exploded"`) or null. */
  bomb_state?: BombState | null;
  /** Wallet money (USD). Null until CS2 sends it. */
  money?: number | null;
  /** HP (0-100). */
  health?: number | null;
  /** Armor (0-100). */
  armor?: number | null;
  /** Helmet flag — when armor>0 AND helmet=true, HUD shows "+kit". */
  helmet?: boolean | null;
  /** Defuse kit flag — CT-only signal; rendered as a small "kit" badge. */
  defuse_kit?: boolean | null;
  /** Total $ value of currently-equipped items. Buy-tier hint. */
  equip_value?: number | null;
  /** CT team's current round score. */
  ct_score?: number | null;
  /** T team's current round score. */
  t_score?: number | null;
  /** Round number (1-based; CS2's 0-based round + 1). Null in warmup. */
  round_number?: number | null;
  /** Raw Valve slug of the active weapon (e.g., `weapon_smokegrenade`). */
  active_weapon?: string | null;
  /**
   * MGA utility-type slug for the actively-held grenade. Null when the
   * player isn't holding a grenade (knife, rifle, no weapon, etc.).
   * Drives PR 10's utility-held lineup filter.
   */
  active_utility?: string | null;
  /**
   * MGA utility-type slugs for ALL grenades in inventory (deduplicated).
   * When no specific grenade is active, the live filter falls back to
   * narrowing by any of these.
   */
  held_utility_slugs: string[];
  /**
   * Unix epoch seconds from CS2's `provider.timestamp`. Useful only as
   * a sanity-check signal — CS2 redacts the actual round timer.
   */
  provider_timestamp?: number | null;
  /** Raw CS2 player_state passthrough (kept for PR 8 backward compat). */
  player_state?: Record<string, unknown>;
  /** Raw CS2 player_match_stats passthrough. */
  match_stats?: Record<string, unknown>;
  /** RFC3339 timestamp at which the Rust receiver parsed this payload. */
  received_at: string;
}

/**
 * Server-status snapshot emitted by the Rust receiver via the Tauri event
 * `gsi:server-status` on startup and on every accepted POST. Also returned
 * by the `gsi_server_status` IPC command.
 *
 * Matches the `ServerStatusSnapshot` struct in `src-tauri/src/gsi/state.rs`.
 */
export interface GsiServerStatus {
  /** True when the axum listener is bound and accepting payloads. */
  running: boolean;
  /** Port the listener is bound to. */
  port: number;
  /** Cumulative count of accepted payloads since the receiver started. */
  payloads_received: number;
  /** RFC3339 timestamp of the most recent accepted payload. */
  last_event_at?: string;
  /** True if the auth token was loaded (or freshly generated) on boot. */
  auth_token_loaded: boolean;
}

/**
 * Result of `install_cs2_gsi_config`. Matches `InstallResult` in
 * `src-tauri/src/gsi/installer.rs`.
 */
export interface GsiInstallResult {
  /** True if the cfg was written successfully. */
  installed: boolean;
  /** Absolute path the cfg was written to, or attempted. */
  path: string;
  /** Human-readable error when `installed` is false. */
  error?: string;
}

/**
 * Result of `uninstall_cs2_gsi_config`. Matches `UninstallResult` in
 * `src-tauri/src/gsi/installer.rs`.
 */
export interface GsiUninstallResult {
  removed: boolean;
  path: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// PR 9a — Minimap CV pipeline
// ---------------------------------------------------------------------------

/**
 * Snapshot of the CV pipeline's state, returned by the `cv_status` IPC
 * command. Matches `CvStatusSnapshot` in `src-tauri/src/cv/state.rs`.
 *
 * `platform_supported` distinguishes "stopped, but Windows so the user can
 * start it" from "stopped because Mac/Linux has no capture backend in PR 9a".
 * The Setup page surfaces the latter with a clear message instead of a
 * generic "stopped" UI.
 */
export interface CvStatus {
  /** True when the pipeline tokio task is alive (ticking at 20 Hz). */
  running: boolean;
  /** True when the current platform has a working screen-capture backend. */
  platform_supported: boolean;
  /** Map slug the pipeline is currently tracking, or null when no map. */
  current_map?: string | null;
  /** Most-recently-detected zone slug, or null. */
  last_zone?: string | null;
  /** RFC3339 timestamp of the most recent detection, or null. */
  last_detection_at?: string | null;
  /** Cumulative ticks executed. */
  ticks_total: number;
  /** Ticks that errored. */
  ticks_errored: number;
  /** Exponentially-weighted average tick latency, milliseconds. */
  avg_tick_ms: number;
  /** Single most-recent tick latency, milliseconds. */
  last_tick_ms: number;
  /** True when the current map has a calibration loaded. */
  calibration_loaded: boolean;
  /** Last pipeline error, or null when the most recent tick succeeded. */
  last_error?: string | null;
}

/**
 * Event payload emitted by the Rust pipeline via `cv:zone-detected` on
 * every zone-CHANGE (post-hysteresis). Matches `CvZoneDetectedEvent` in
 * `src-tauri/src/cv/pipeline.rs`.
 */
export interface CvZoneDetectedEvent {
  /** Map this detection applies to. */
  map_slug: string;
  /**
   * Newly-detected zone slug, or null when the player has moved off all
   * known zones. Null is a valid emit — frontend falls back to (map, side)
   * filter in that case.
   */
  zone_slug?: string | null;
  /** 0.0 (at tolerance limit) — 1.0 (perfect colour match). */
  confidence: number;
  /** Single-tick latency that produced this detection, milliseconds. */
  latency_ms: number;
  /** RFC3339 timestamp. */
  detected_at: string;
}

/**
 * Per-map calibration package read/written by `cv_get_calibration` and
 * `cv_set_calibration`. Matches `MapCalibrationPackage` in
 * `src-tauri/src/cv/calibration.rs`.
 *
 * PR 9a uses this read-only for the Setup page's "calibration loaded?"
 * indicator. PR 9b's editor uses it as the editor schema.
 */
export interface CvMinimapCalibration {
  schema_version: number;
  resolution: string;
  minimap_region: { x: number; y: number; width: number; height: number };
  world_transform: {
    scale_x: number;
    scale_y: number;
    offset_x: number;
    offset_y: number;
  };
  dot_detection: {
    target_rgb: [number, number, number];
    color_tolerance: number;
    min_area_px: number;
    max_area_px: number;
  };
}

export interface CvZonePolygon {
  slug: string;
  name: string;
  /** `[x, y]` tuples in 0-1 normalized world space. */
  points: Array<[number, number]>;
}

export interface CvMapCalibrationPackage {
  map_slug: string;
  calibration: CvMinimapCalibration;
  zones: CvZonePolygon[];
}

// ---------------------------------------------------------------------------
// PR 9b — Calibration UI shared shapes
// ---------------------------------------------------------------------------

/** Aliased shapes for the calibration UI's reducer + helpers. Keeps the
 *  inner types narrow + easy to test in isolation. */
export type CvCaptureRegion = CvMinimapCalibration["minimap_region"];
export type CvWorldTransform = CvMinimapCalibration["world_transform"];
export type CvDotDetectionParams = CvMinimapCalibration["dot_detection"];

/** Result of `cv_capture_frame`. Mirrors `CvCaptureFrameResult` in
 *  `src-tauri/src/cv/commands.rs`. */
export interface CvCaptureFrameResult {
  png_base64: string;
  width: number;
  height: number;
}

/** Result of `cv_get_primary_monitor_resolution`. Mirrors
 *  `MonitorResolution` in `src-tauri/src/capture/mod.rs`. */
export interface CvMonitorResolution {
  width: number;
  height: number;
}

/** Result of `cv_set_dot_params_preview`. */
export interface CvSetDotParamsPreviewResult {
  /** True when an active calibration absorbed the new params; false when no
   *  map is loaded yet (UI should still feel responsive — preview is a
   *  no-op until then). */
  applied: boolean;
}

/** Result of `cv_reset_calibration`. */
export interface CvResetCalibrationResult {
  removed: boolean;
  path: string;
}

/** Per-blob bounding box payload nested inside `CvDebugFrameEvent`. */
export interface CvDebugBlob {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

/** Live preview payload for the dot-tuning UI. Emitted at ~4 Hz while the
 *  pipeline is running AND at least one frontend listener is attached
 *  (subscriber gating; see `useCvDebugFrame`). */
export interface CvDebugFrameEvent {
  /** Base64-encoded PNG of the captured minimap region. */
  png_base64: string;
  blobs: CvDebugBlob[];
  dot_match?: { x: number; y: number } | null;
  tick_ms: number;
}

/**
 * Source of a loaded calibration package. `bundled` means the binary
 * shipped it; `override` means the operator has saved an edit; `unknown`
 * means we haven't queried yet OR no calibration exists at all.
 */
export type CalibrationSource = "bundled" | "override" | "unknown";

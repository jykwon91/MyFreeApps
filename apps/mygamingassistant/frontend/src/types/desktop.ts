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
 * Normalized GSI event payload emitted by the Rust receiver via the Tauri
 * event `gsi:state-update` on every accepted POST from CS2.
 *
 * Matches the `GsiEvent` struct in `src-tauri/src/gsi/payload.rs`.
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
  /** Raw CS2 player_state passthrough (money, weapons, health). */
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

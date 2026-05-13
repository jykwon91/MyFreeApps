/**
 * Shapes returned by Tauri IPC commands.
 *
 * Keep these in sync with `apps/mygamingassistant/desktop/src-tauri/src/commands.rs`.
 * Each Rust struct serialized by `serde` has a corresponding TypeScript
 * interface here.
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

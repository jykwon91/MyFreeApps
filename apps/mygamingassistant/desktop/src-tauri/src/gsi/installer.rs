//! CS2 GSI configuration file installer.
//!
//! What this module does:
//!   1. Locate CS2's `cfg/` directory using OS-specific Steam install paths.
//!   2. Write `gamestate_integration_mygamingassistant.cfg` with the
//!      receiver's HTTP endpoint + shared auth token.
//!   3. Allow override of the cfg path for non-standard Steam library
//!      locations (e.g., users with games on a secondary drive).
//!   4. Remove the cfg on `uninstall_cs2_gsi_config`.
//!
//! What this module does NOT do:
//!   - Auto-detect non-default Steam library folders. CS2 can live in any
//!     library configured under `Steam/steamapps/libraryfolders.vdf`. We
//!     ship the most common default path and accept a manual override
//!     instead of parsing VDF, which is fiddly and the wrong place to spend
//!     time before the rest of live mode works end-to-end.
//!   - Validate that CS2 is actually installed. We just write the file; if
//!     CS2 isn't there, it'll be a no-op (CS2 reads cfg/ on launch).

use std::path::{Path, PathBuf};

use serde::Serialize;

/// CS2 cfg filename. Per Valve convention, GSI config files MUST start with
/// `gamestate_integration_` and end with `.cfg`. The middle part is
/// arbitrary (it's the human-readable provider name displayed in CS2 dev
/// console). We use the project's brand here.
pub const GSI_CFG_FILENAME: &str = "gamestate_integration_mygamingassistant.cfg";

/// Default port for the GSI HTTP receiver. 8765 is commonly used in GSI
/// community tutorials and isn't claimed by any well-known service per
/// IANA's port registry. Configurable, but most setups won't need to
/// change it.
pub const DEFAULT_GSI_PORT: u16 = 8765;

/// Result of `install_cs2_gsi_config` returned to the frontend.
#[derive(Debug, Serialize)]
pub struct InstallResult {
    /// `true` if the .cfg was written successfully.
    pub installed: bool,
    /// Absolute path the .cfg was written to (or attempted, if `installed`
    /// is false). Empty string when path detection failed and no custom
    /// path was provided.
    pub path: String,
    /// Human-readable error message when `installed` is false. None on
    /// success.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Result of `uninstall_cs2_gsi_config`.
#[derive(Debug, Serialize)]
pub struct UninstallResult {
    pub removed: bool,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Detect the most-common CS2 `cfg/` directory on the current OS.
///
/// Returns `None` when the OS-specific user-home lookup fails (very rare —
/// only happens in CI / sandboxed environments where HOME isn't set). The
/// returned path is NOT validated for existence; the caller writes to it
/// and surfaces any IO error in the response.
pub fn detect_cs2_cfg_dir() -> Option<PathBuf> {
    detect_cs2_cfg_dir_with_home(dirs::home_dir())
}

/// Inner implementation that takes the home dir as a parameter so tests
/// can exercise the OS-specific path-shaping without touching the real
/// filesystem.
pub fn detect_cs2_cfg_dir_with_home(home: Option<PathBuf>) -> Option<PathBuf> {
    let home = home?;

    // The `csgo/` subdir name is preserved in CS2 — Valve kept legacy paths
    // for mod compatibility. Verified via community CS2 GSI tutorials.
    //
    // We return ONE candidate per platform — the most common default. If
    // the user has CS2 in a non-default Steam library, they pass
    // `custom_path` to `install_cs2_gsi_config` instead.
    #[cfg(target_os = "windows")]
    {
        let _ = home; // Default Windows Steam install is system-wide, not user-scoped.
        Some(PathBuf::from(
            r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg",
        ))
    }
    #[cfg(target_os = "macos")]
    {
        Some(home.join("Library/Application Support/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg"))
    }
    #[cfg(target_os = "linux")]
    {
        // Two well-known locations on Linux:
        //   - ~/.steam/steam/...           (Steam's "official" symlink)
        //   - ~/.local/share/Steam/...     (the actual on-disk location)
        // We return the first; if writing fails the user can pass
        // `custom_path` pointing at either the symlink or the resolved path.
        Some(home.join(".steam/steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        // Unsupported OS — caller must supply custom_path.
        let _ = home;
        None
    }
}

/// Render the GSI cfg file contents.
///
/// The format is Valve's KeyValues (VDF). Indentation is for human
/// readability — CS2 ignores it. Token is interpolated as a plain string
/// (no escape sequences needed; UUIDs are alphanumeric + hyphens).
pub fn render_gsi_cfg(port: u16, auth_token: &str) -> String {
    // Heartbeat 30s ensures we see "Connected" status in the UI even when
    // nothing is happening in-game. Throttle 0.1s caps the POST rate at
    // 10 Hz, which is more than enough for our use case (we only react to
    // map / side / round-phase changes).
    format!(
        r#""MyGamingAssistant Live"
{{
    "uri" "http://127.0.0.1:{port}"
    "timeout" "5.0"
    "buffer" "0.1"
    "throttle" "0.1"
    "heartbeat" "30.0"
    "auth"
    {{
        "token" "{auth_token}"
    }}
    "data"
    {{
        "provider"            "1"
        "map"                 "1"
        "map_round_wins"      "1"
        "round"               "1"
        "player_id"           "1"
        "player_state"        "1"
        "player_weapons"      "1"
        "player_match_stats"  "1"
    }}
}}
"#,
        port = port,
        auth_token = auth_token,
    )
}

/// Resolve the directory to write the cfg into. Priority:
///   1. caller-supplied `custom_path` (treated as the cfg dir itself OR a
///      Steam install root — see logic below)
///   2. OS-specific default
///
/// `custom_path` is interpreted as the `cfg/` directory directly. If the
/// user passes a path that ends with `csgo` or `csgo/cfg`, that's their
/// responsibility — we don't second-guess.
fn resolve_cfg_dir(custom_path: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = custom_path.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(PathBuf::from(p));
    }
    detect_cs2_cfg_dir()
}

/// Install the GSI cfg.
///
/// `custom_path` (optional): override of the cfg directory. Set this when
/// CS2 lives in a non-default Steam library location. Pass `None` to use
/// the OS-default path.
pub fn install_gsi_cfg(
    custom_path: Option<&str>,
    port: u16,
    auth_token: &str,
) -> InstallResult {
    let Some(cfg_dir) = resolve_cfg_dir(custom_path) else {
        return InstallResult {
            installed: false,
            path: String::new(),
            error: Some(
                "Could not detect CS2 cfg directory. Pass the path manually via custom_path."
                    .to_string(),
            ),
        };
    };

    let full_path = cfg_dir.join(GSI_CFG_FILENAME);
    let path_str = full_path.to_string_lossy().into_owned();

    // Ensure parent exists. We DO NOT create the entire Steam path — if CS2
    // isn't installed, we shouldn't be inventing directories.
    if !cfg_dir.exists() {
        return InstallResult {
            installed: false,
            path: path_str,
            error: Some(format!(
                "Directory does not exist: {}. Is CS2 installed at this path?",
                cfg_dir.display()
            )),
        };
    }

    let contents = render_gsi_cfg(port, auth_token);
    match std::fs::write(&full_path, contents) {
        Ok(()) => InstallResult {
            installed: true,
            path: path_str,
            error: None,
        },
        Err(e) => {
            log::warn!(
                "GSI cfg install failed: path={} kind={:?} message={}",
                full_path.display(),
                e.kind(),
                e,
            );
            InstallResult {
                installed: false,
                path: path_str,
                error: Some(format!("Failed to write cfg file: {e}")),
            }
        }
    }
}

/// Remove the GSI cfg file. No-op if the file doesn't exist.
pub fn uninstall_gsi_cfg(custom_path: Option<&str>) -> UninstallResult {
    let Some(cfg_dir) = resolve_cfg_dir(custom_path) else {
        return UninstallResult {
            removed: false,
            path: String::new(),
            error: Some(
                "Could not detect CS2 cfg directory. Pass the path manually via custom_path."
                    .to_string(),
            ),
        };
    };

    let full_path = cfg_dir.join(GSI_CFG_FILENAME);
    let path_str = full_path.to_string_lossy().into_owned();

    if !full_path.exists() {
        return UninstallResult {
            removed: false,
            path: path_str,
            error: Some("Config file was not installed at this path.".to_string()),
        };
    }

    match std::fs::remove_file(&full_path) {
        Ok(()) => UninstallResult {
            removed: true,
            path: path_str,
            error: None,
        },
        Err(e) => UninstallResult {
            removed: false,
            path: path_str,
            error: Some(format!("Failed to remove cfg file: {e}")),
        },
    }
}

/// Resolve the file path that the auth token is persisted to.
///
/// On Tauri the canonical location is `app_data_dir()`. We accept the path
/// rather than computing it here so this module stays decoupled from the
/// Tauri AppHandle (helps with unit testing).
pub fn auth_token_path(app_config_dir: &Path) -> PathBuf {
    app_config_dir.join("cs2_gsi_auth_token")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn render_gsi_cfg_contains_required_fields() {
        let cfg = render_gsi_cfg(8765, "test-token-uuid-1234");
        // Sanity: every field CS2 requires must appear.
        assert!(cfg.contains("MyGamingAssistant Live"));
        assert!(cfg.contains("http://127.0.0.1:8765"));
        assert!(cfg.contains("test-token-uuid-1234"));
        assert!(cfg.contains("\"throttle\" \"0.1\""));
        assert!(cfg.contains("\"heartbeat\" \"30.0\""));
        // The data block subscriptions we need for live mode:
        assert!(cfg.contains("\"map\"                 \"1\""));
        assert!(cfg.contains("\"player_state\"        \"1\""));
    }

    #[test]
    fn render_gsi_cfg_with_custom_port() {
        let cfg = render_gsi_cfg(31337, "x");
        assert!(cfg.contains("http://127.0.0.1:31337"));
    }

    #[test]
    fn detect_cs2_cfg_dir_with_home_returns_path_when_home_set() {
        let fake_home = PathBuf::from("/test/home");
        let result = detect_cs2_cfg_dir_with_home(Some(fake_home.clone()));
        assert!(result.is_some(), "should return a path when home is set");
        let path = result.unwrap();
        // The cfg path must contain "csgo/cfg" on every supported OS —
        // CS2 inherited the legacy CSGO directory name.
        let path_str = path.to_string_lossy();
        assert!(
            path_str.contains("Counter-Strike Global Offensive")
                || path_str.contains(r"Counter-Strike Global Offensive"),
            "path should mention CS install dir: {}",
            path_str
        );
    }

    #[test]
    fn detect_cs2_cfg_dir_with_home_returns_none_when_no_home() {
        let result = detect_cs2_cfg_dir_with_home(None);
        assert!(
            result.is_none(),
            "should return None when home dir is unavailable"
        );
    }

    #[test]
    fn install_gsi_cfg_writes_file_to_existing_dir() {
        let dir = tempdir().expect("tempdir");
        let path_str = dir.path().to_string_lossy().into_owned();

        let result = install_gsi_cfg(Some(&path_str), 8765, "test-token");

        assert!(result.installed, "install should succeed: {:?}", result.error);
        assert_eq!(result.error, None);
        assert!(result.path.ends_with(GSI_CFG_FILENAME));

        let cfg_contents =
            std::fs::read_to_string(&result.path).expect("cfg should be readable");
        assert!(cfg_contents.contains("test-token"));
        assert!(cfg_contents.contains("8765"));
    }

    #[test]
    fn install_gsi_cfg_returns_error_when_dir_missing() {
        let nonexistent = "/this/path/should/not/exist/anywhere/12345";

        let result = install_gsi_cfg(Some(nonexistent), 8765, "test-token");

        assert!(!result.installed);
        assert!(result.error.is_some());
        let err_msg = result.error.as_deref().unwrap_or("");
        assert!(
            err_msg.contains("Directory does not exist") || err_msg.contains("Is CS2 installed"),
            "error should mention missing dir, got: {err_msg}"
        );
    }

    #[test]
    fn uninstall_gsi_cfg_removes_file_when_present() {
        let dir = tempdir().expect("tempdir");
        let path_str = dir.path().to_string_lossy().into_owned();

        // Install first
        install_gsi_cfg(Some(&path_str), 8765, "test-token");
        let full_path = dir.path().join(GSI_CFG_FILENAME);
        assert!(full_path.exists());

        // Then uninstall
        let result = uninstall_gsi_cfg(Some(&path_str));
        assert!(result.removed, "uninstall should succeed: {:?}", result.error);
        assert!(!full_path.exists(), "file should be gone");
    }

    #[test]
    fn uninstall_gsi_cfg_idempotent_when_not_installed() {
        let dir = tempdir().expect("tempdir");
        let path_str = dir.path().to_string_lossy().into_owned();

        // Nothing to remove
        let result = uninstall_gsi_cfg(Some(&path_str));
        assert!(!result.removed);
        // Surface the "not installed" hint to the user.
        assert!(result.error.is_some());
    }

    #[test]
    fn auth_token_path_lives_under_config_dir() {
        let cfg = PathBuf::from("/test/config");
        let token = auth_token_path(&cfg);
        assert_eq!(token, PathBuf::from("/test/config/cs2_gsi_auth_token"));
    }
}

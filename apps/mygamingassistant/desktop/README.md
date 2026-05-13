# desktop/

Tauri 2.x desktop shell for MyGamingAssistant.

Wraps the React SPA in `../frontend/dist` as a native binary using the system
webview (~10 MB bundles). Same frontend codebase ships to the web deploy and
the desktop binary; runtime detection of Tauri (`window.__TAURI_INTERNALS__`)
gates desktop-only UI.

## Status

- **PR 7 (this PR):** Shell + smoke-test IPC command + cross-platform CI.
- **PR 8 (next):** CS2 Game State Integration (GSI) HTTP receiver — slots
  into `src-tauri/src/gsi/`.
- **PR 9:** Windows DXGI Desktop Duplication screen capture (`capture/`) +
  minimap CV pipeline (`cv/`).
- **PRs 10-11:** Wire live mode for CS2 then Valorant.
- **PR 12:** Polish.

## Layout

```
desktop/
├── package.json          # Tauri CLI as devDep (npm workspace)
├── src-tauri/
│   ├── Cargo.toml        # Rust crate manifest
│   ├── Cargo.lock        # Committed (binary, not library)
│   ├── build.rs          # Tauri build script
│   ├── tauri.conf.json   # Points `frontendDist` at ../../frontend/dist
│   ├── capabilities/     # Tauri 2.x permission scopes
│   ├── icons/            # Placeholder icons + generate.py
│   └── src/
│       ├── main.rs       # Binary entrypoint
│       ├── lib.rs        # tauri::Builder + module registration
│       ├── commands.rs   # IPC commands (PR 7: get_app_version)
│       ├── gsi/          # PR 8 — CS2 GSI receiver
│       ├── capture/      # PR 9 — DXGI screen capture
│       └── cv/           # PR 9 — minimap CV pipeline
└── .gitignore
```

## Prerequisites

Local development requires:

- **Rust** (stable, 1.77+ — install via [rustup](https://rustup.rs/))
- **Node.js** 22+ (matches monorepo CI)
- **Platform deps** for the Tauri webview:
  - **Linux:** `libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Ubuntu 22.04+)
  - **macOS:** Xcode Command Line Tools
  - **Windows:** WebView2 (preinstalled on Windows 11; on Windows 10 it's
    distributed via Windows Update)

Full list: https://tauri.app/start/prerequisites/

## Local development

From the monorepo root:

```bash
# One-time: install JS dependencies (Tauri CLI lives in npm workspace).
npm install

# Run the desktop app with hot-reload (starts the Vite dev server too):
npm --workspace=apps/mygamingassistant/desktop run dev
```

Or from this directory directly:

```bash
cd apps/mygamingassistant/desktop
npm run dev          # cargo tauri dev
npm run build        # cargo tauri build (production bundle)
npm run build:debug  # cargo tauri build --debug (faster, unsigned)
```

## CI

`.github/workflows/ci-mygamingassistant-desktop.yml` builds the binary on
`ubuntu-22.04`, `windows-latest`, and `macos-latest`. Unsigned artifacts are
uploaded per platform; signing and notarization are deferred (operator setup).

## Icons

`src-tauri/icons/` contains a placeholder dark-purple-square icon set generated
by `generate.py`. To replace with real artwork:

```bash
cd src-tauri
cargo tauri icon /path/to/source-1024.png
```

This regenerates all five files (`32x32.png`, `128x128.png`, `128x128@2x.png`,
`icon.ico`, `icon.icns`) from the source.

## See also

- `apps/mygamingassistant/CLAUDE.md` — app-level conventions
- Project memory: `project_mygamingassistant_plan.md` — full PR roadmap

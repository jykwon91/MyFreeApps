# desktop/

Reserved for PR 7 — Tauri shell.

This directory will contain the Tauri Rust crate (`src-tauri/`) that wraps
the `../frontend/dist` bundle as a native desktop application. The desktop
binary adds:

- CS2 Game State Integration (GSI) HTTP receiver
- Windows DXGI Desktop Duplication API for minimap screen capture
- opencv-rust computer vision pipeline for player position detection
- Always-on-top overlay window for second-monitor use

Do not implement anything here until PR 7 is started.

See `apps/mygamingassistant/CLAUDE.md` and the project memory plan for the
full PR sequence.

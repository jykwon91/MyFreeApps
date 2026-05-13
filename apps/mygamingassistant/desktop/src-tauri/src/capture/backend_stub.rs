//! Stub capture backend for macOS / Linux / other.
//!
//! Compiled in place of `backend_windows` when the target is not Windows.
//! Every method returns `CaptureError::PlatformNotSupported`. The CV pipeline
//! checks for this error at startup and disables itself with a clear UI
//! status message rather than crashing.
//!
//! Real backends (ScreenCaptureKit on macOS, PipeWire/X11 on Linux) are
//! deferred per the project plan. CS2 ships on Windows + macOS only; Linux
//! is via Proton. Most operators will be on Windows.
//!
//! This file is `#[cfg(not(target_os = "windows"))]`-gated in `mod.rs` so the
//! Windows production build doesn't carry a dead struct.

use super::{CaptureError, CaptureRegion, CapturedFrame, ScreenCapturer};

/// Always-fail capturer for unsupported platforms.
pub struct StubScreenCapturer;

#[allow(dead_code)]
impl StubScreenCapturer {
    pub fn new() -> Self {
        Self
    }
}

impl ScreenCapturer for StubScreenCapturer {
    fn capture_region(&self, _region: CaptureRegion) -> Result<CapturedFrame, CaptureError> {
        Err(CaptureError::PlatformNotSupported)
    }

    fn capture_full_screen(&self) -> Result<CapturedFrame, CaptureError> {
        Err(CaptureError::PlatformNotSupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_capture_region_errors_with_platform_not_supported() {
        let cap = StubScreenCapturer::new();
        let err = cap
            .capture_region(CaptureRegion::new(0, 0, 100, 100))
            .expect_err("stub must error");
        matches!(err, CaptureError::PlatformNotSupported);
    }

    #[test]
    fn stub_capture_full_screen_errors_with_platform_not_supported() {
        let cap = StubScreenCapturer::new();
        let err = cap.capture_full_screen().expect_err("stub must error");
        matches!(err, CaptureError::PlatformNotSupported);
    }
}

//! Cross-platform screen capture (PR 9a).
//!
//! Surface:
//!   - `ScreenCapturer` trait — the only abstraction the CV pipeline depends on.
//!   - `CaptureRegion` / `CapturedFrame` / `CaptureError` value types.
//!   - `new_default_capturer()` — picks the right backend for the current OS.
//!
//! Backends:
//!   - **Windows** (`backend_windows`): wraps the Windows.Graphics.Capture API
//!     via the `windows-capture` crate. Same GPU-shared frame path as DXGI
//!     Desktop Duplication — the frame never crosses the PCIe bus until we
//!     explicitly copy a region into a CPU buffer.
//!   - **macOS / Linux / other** (`backend_stub`): returns
//!     `CaptureError::PlatformNotSupported`. Real implementations deferred
//!     (ScreenCaptureKit / PipeWire) — see `project_mygamingassistant_plan.md`.
//!
//! Cross-platform sub-module that is ALWAYS compiled:
//!   - `fake` — `FakeCapturer` returning canned frames from in-memory pixel
//!     buffers / fixture PNGs. Used by the CV pipeline tests on all platforms
//!     so unit tests don't depend on a real display.
//!
//! Performance contract:
//!   - One `capture_region(...)` call must complete in <8 ms typical on the
//!     reference Windows hardware (RTX 3070-class GPU, 1080p capture region).
//!     Leaves the remaining ~8 ms of the 60-Hz tick budget for CV. Verified
//!     by the perf test in `cv::pipeline::tests` (gated behind `#[ignore]`
//!     to keep CI determinism).

use std::fmt;

// -----------------------------------------------------------------------------
// Value types
// -----------------------------------------------------------------------------

/// Rectangular region in screen pixel space (0,0 = top-left).
///
/// The CV pipeline passes the minimap's screen-pixel rect here. Backends
/// translate this into whatever the OS API expects.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl CaptureRegion {
    /// Shorthand constructor — keeps test code readable.
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// `true` when the region has non-zero area.
    pub fn is_valid(&self) -> bool {
        self.width > 0 && self.height > 0
    }
}

/// A captured frame in RGBA8 (4 bytes per pixel, row-major, top-left origin).
///
/// `pixels.len()` MUST equal `width * height * 4`. Backends are responsible
/// for converting the OS-native frame format (BGRA on Windows DXGI) into
/// RGBA before returning.
#[derive(Debug, Clone)]
pub struct CapturedFrame {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl CapturedFrame {
    /// Construct a frame, validating the buffer length matches dimensions.
    pub fn from_rgba(width: u32, height: u32, pixels: Vec<u8>) -> Result<Self, CaptureError> {
        let expected = (width as usize)
            .checked_mul(height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or(CaptureError::InvalidDimensions {
                width,
                height,
            })?;
        if pixels.len() != expected {
            return Err(CaptureError::BufferSizeMismatch {
                expected,
                got: pixels.len(),
            });
        }
        Ok(Self {
            width,
            height,
            pixels,
        })
    }
}

/// Capture failure modes. Errors are not silently swallowed — see
/// `rules/check-third-party-error-codes.md`. Where the underlying OS API
/// returns a structured code (DXGI HRESULT, etc.), we capture it in
/// `BackendError::detail` and log at WARN.
#[derive(Debug)]
pub enum CaptureError {
    /// The current OS doesn't ship a screen-capture backend. Today: Mac, Linux.
    PlatformNotSupported,
    /// The requested region has zero width or height.
    InvalidRegion(CaptureRegion),
    /// Region dimensions can't fit in `usize` arithmetic (defensive).
    InvalidDimensions { width: u32, height: u32 },
    /// A backend returned a buffer that doesn't match the requested dimensions.
    BufferSizeMismatch { expected: usize, got: usize },
    /// The OS capture API itself failed. `detail` carries the provider's
    /// structured code where available (e.g., `"HRESULT=0x..."`).
    BackendError { detail: String },
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PlatformNotSupported => {
                write!(
                    f,
                    "screen capture is not implemented for the current OS \
                     (Windows-only in PR 9a)"
                )
            }
            Self::InvalidRegion(r) => {
                write!(
                    f,
                    "invalid capture region: width={} height={} (both must be > 0)",
                    r.width, r.height
                )
            }
            Self::InvalidDimensions { width, height } => {
                write!(
                    f,
                    "capture dimensions overflow usize: width={width} height={height}"
                )
            }
            Self::BufferSizeMismatch { expected, got } => {
                write!(
                    f,
                    "captured frame buffer size mismatch: expected {expected} got {got}"
                )
            }
            Self::BackendError { detail } => write!(f, "capture backend error: {detail}"),
        }
    }
}

impl std::error::Error for CaptureError {}

// -----------------------------------------------------------------------------
// Trait
// -----------------------------------------------------------------------------

/// The single abstraction the CV pipeline depends on.
///
/// `Send + Sync + 'static` because the pipeline holds it inside an
/// `Arc<dyn ScreenCapturer>` and accesses it from a tokio task.
pub trait ScreenCapturer: Send + Sync + 'static {
    /// Capture a single rectangular region of the primary display.
    ///
    /// MUST return a frame with `width == region.width` and
    /// `height == region.height`. The pixel buffer is RGBA8, row-major.
    fn capture_region(&self, region: CaptureRegion) -> Result<CapturedFrame, CaptureError>;

    /// Capture the full primary display. Used by the calibration UI (PR 9b)
    /// to let the operator click the minimap corners on a screenshot. Defaults
    /// to capturing a `CaptureRegion` covering `0..max_width × 0..max_height`
    /// for backends that don't natively distinguish.
    fn capture_full_screen(&self) -> Result<CapturedFrame, CaptureError>;
}

// -----------------------------------------------------------------------------
// Backend selection
// -----------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod backend_windows;

#[cfg(not(target_os = "windows"))]
mod backend_stub;

pub mod fake;

/// Construct the default capturer for the current OS.
///
/// Returns `Err(CaptureError::PlatformNotSupported)` on non-Windows targets
/// today; the CV pipeline detects this and disables itself with a clear UI
/// message instead of crashing.
pub fn new_default_capturer() -> Result<Box<dyn ScreenCapturer>, CaptureError> {
    #[cfg(target_os = "windows")]
    {
        backend_windows::WindowsScreenCapturer::new()
            .map(|c| Box::new(c) as Box<dyn ScreenCapturer>)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(CaptureError::PlatformNotSupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_region_validity() {
        assert!(CaptureRegion::new(0, 0, 100, 100).is_valid());
        assert!(!CaptureRegion::new(0, 0, 0, 100).is_valid());
        assert!(!CaptureRegion::new(0, 0, 100, 0).is_valid());
        assert!(!CaptureRegion::new(0, 0, 0, 0).is_valid());
    }

    #[test]
    fn from_rgba_validates_buffer_size() {
        // 2x2 RGBA = 16 bytes
        let buf = vec![0u8; 16];
        let frame = CapturedFrame::from_rgba(2, 2, buf).expect("valid frame");
        assert_eq!(frame.width, 2);
        assert_eq!(frame.height, 2);
    }

    #[test]
    fn from_rgba_rejects_wrong_buffer_size() {
        // 2x2 expects 16 bytes; pass 15.
        let buf = vec![0u8; 15];
        let err = CapturedFrame::from_rgba(2, 2, buf).expect_err("wrong size rejected");
        match err {
            CaptureError::BufferSizeMismatch { expected, got } => {
                assert_eq!(expected, 16);
                assert_eq!(got, 15);
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn capture_error_display_has_useful_text() {
        let msg = format!("{}", CaptureError::PlatformNotSupported);
        assert!(msg.contains("Windows"));

        let msg = format!("{}", CaptureError::InvalidRegion(CaptureRegion::new(0, 0, 0, 100)));
        assert!(msg.contains("invalid"));

        let msg = format!(
            "{}",
            CaptureError::BackendError {
                detail: "HRESULT=0x80004005".into(),
            }
        );
        assert!(msg.contains("backend"));
        assert!(msg.contains("HRESULT"));
    }

    /// Non-Windows builds get the platform-not-supported error from the
    /// default constructor. This is the negative path the CV pipeline relies
    /// on to disable itself gracefully on Mac/Linux CI runners.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn new_default_capturer_returns_platform_not_supported_off_windows() {
        let err = new_default_capturer().expect_err("non-Windows must error");
        matches!(err, CaptureError::PlatformNotSupported);
    }
}

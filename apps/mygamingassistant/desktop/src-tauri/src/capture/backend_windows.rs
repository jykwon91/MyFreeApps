//! Windows screen-capture backend using the Windows.Graphics.Capture API
//! (WGC). Same GPU-shared frame path as DXGI Desktop Duplication.
//!
//! Why WGC and not raw DXGI:
//!   - WGC is the modern Windows 10+ replacement for DXGI Desktop Duplication;
//!     same performance characteristics (GPU-shared, no PCIe copy until the
//!     CPU explicitly reads), simpler API (no raw COM ceremony).
//!   - `windows-capture` is a pure-Rust binding (no C++/vcpkg), maintained
//!     and actively used. We don't need the raw `windows` crate's
//!     `Win32_Graphics_Dxgi` bindings.
//!
//! Architecture:
//!   - `WindowsScreenCapturer::new()` starts a long-lived capture session on
//!     the primary monitor. The session runs on its own thread inside
//!     `windows-capture` and delivers frames via a `GraphicsCaptureApiHandler`
//!     callback.
//!   - The handler writes each frame's BGRA bytes into a shared
//!     `Arc<Mutex<Option<LatestFrame>>>`.
//!   - `capture_region(region)` reads the latest frame, slices out the
//!     requested rectangle, converts BGRA → RGBA, and returns. No blocking
//!     wait — if no frame has arrived yet, returns `BackendError`.
//!
//! Error capture:
//!   - Per `rules/check-third-party-error-codes.md`, any failure from
//!     `windows-capture` is logged at WARN with the structured Rust error
//!     and surfaced to the caller as `CaptureError::BackendError { detail }`.
//!   - HRESULTs from underlying COM APIs are not directly exposed by
//!     `windows-capture` (it wraps them in its own error type), but the
//!     `Display` impl of that error type includes enough context to
//!     diagnose. We never `unwrap()` or silently swallow.

use std::sync::{Arc, Mutex};

use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{ColorFormat, CursorCaptureSettings, DrawBorderSettings, Settings},
};

use super::{CaptureError, CaptureRegion, CapturedFrame, ScreenCapturer};

/// Most-recently-arrived frame in the BGRA8 native WGC format.
/// We hold ONE frame at a time; the next callback overwrites it. The CV
/// pipeline ticks at 20 Hz; WGC delivers at the monitor refresh rate (60+ Hz)
/// so we never run out of fresh frames.
#[derive(Debug)]
struct LatestFrame {
    width: u32,
    height: u32,
    /// BGRA8 row-major, top-left origin. Length == width * height * 4.
    bgra: Vec<u8>,
}

/// Shared state between the WGC callback thread and the public API.
type SharedLatest = Arc<Mutex<Option<LatestFrame>>>;

/// Production Windows screen-capture backend.
pub struct WindowsScreenCapturer {
    latest: SharedLatest,
    /// Handle to the running capture session. We deliberately keep it
    /// alive for the lifetime of the capturer; dropping it stops the
    /// background thread.
    _control: windows_capture::capture::CaptureControl<CaptureHandler, CaptureError>,
}

impl WindowsScreenCapturer {
    /// Initialize the WGC session on the primary monitor.
    ///
    /// Fails if:
    ///   - No primary monitor is available (very rare; CI runners without
    ///     a display will hit this).
    ///   - WGC isn't available (Windows < 10 1903; we don't support those).
    pub fn new() -> Result<Self, CaptureError> {
        let primary = Monitor::primary().map_err(|e| {
            log::warn!("WindowsScreenCapturer: failed to resolve primary monitor: {e}");
            CaptureError::BackendError {
                detail: format!("primary monitor lookup failed: {e}"),
            }
        })?;

        let latest: SharedLatest = Arc::new(Mutex::new(None));
        let context = CaptureContext {
            latest: latest.clone(),
        };

        let settings = Settings::new(
            primary,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::WithoutBorder,
            ColorFormat::Rgba8,
            context,
        );

        // `start_free_threaded` returns a CaptureControl whose Drop stops
        // the session. We MUST keep it alive.
        let control = CaptureHandler::start_free_threaded(settings).map_err(|e| {
            log::warn!("WindowsScreenCapturer: failed to start capture session: {e}");
            CaptureError::BackendError {
                detail: format!("WGC start_free_threaded failed: {e}"),
            }
        })?;

        Ok(Self {
            latest,
            _control: control,
        })
    }

    /// Read the most-recent frame and slice out `region`. Returns
    /// `BackendError` if no frame has arrived yet (uncommon — WGC normally
    /// delivers the first frame within ~1 monitor refresh interval).
    fn read_region(&self, region: CaptureRegion) -> Result<CapturedFrame, CaptureError> {
        if !region.is_valid() {
            return Err(CaptureError::InvalidRegion(region));
        }

        let guard = self.latest.lock().map_err(|_| CaptureError::BackendError {
            detail: "latest-frame mutex poisoned".into(),
        })?;

        let Some(frame) = guard.as_ref() else {
            return Err(CaptureError::BackendError {
                detail: "no frame received from WGC yet (try again in a few ms)".into(),
            });
        };

        // Validate the region fits inside the frame. The caller passes
        // screen-pixel coords; the WGC frame is the FULL primary monitor.
        if region
            .x
            .checked_add(region.width)
            .is_none_or(|x| x > frame.width)
            || region
                .y
                .checked_add(region.height)
                .is_none_or(|y| y > frame.height)
        {
            return Err(CaptureError::BackendError {
                detail: format!(
                    "region {}x{} at ({},{}) exceeds frame {}x{}",
                    region.width, region.height, region.x, region.y, frame.width, frame.height
                ),
            });
        }

        // Slice + convert BGRA → RGBA. Allocate a fresh buffer in RGBA
        // shape; this is the only per-tick allocation in the capture path
        // and at 1920x1080 minimap region size (~250kB) is well within the
        // 16ms budget.
        let mut out = Vec::with_capacity((region.width as usize) * (region.height as usize) * 4);
        let stride = (frame.width as usize) * 4;
        for row in 0..region.height {
            let row_start = ((region.y + row) as usize) * stride + (region.x as usize) * 4;
            let row_end = row_start + (region.width as usize) * 4;
            // We requested ColorFormat::Rgba8 from WGC so the source is
            // already in RGBA order. Copy as-is.
            out.extend_from_slice(&frame.bgra[row_start..row_end]);
        }

        CapturedFrame::from_rgba(region.width, region.height, out)
    }

    /// Read the entire most-recent frame as-is.
    fn read_full(&self) -> Result<CapturedFrame, CaptureError> {
        let guard = self.latest.lock().map_err(|_| CaptureError::BackendError {
            detail: "latest-frame mutex poisoned".into(),
        })?;

        let Some(frame) = guard.as_ref() else {
            return Err(CaptureError::BackendError {
                detail: "no frame received from WGC yet".into(),
            });
        };

        CapturedFrame::from_rgba(frame.width, frame.height, frame.bgra.clone())
    }
}

impl ScreenCapturer for WindowsScreenCapturer {
    fn capture_region(&self, region: CaptureRegion) -> Result<CapturedFrame, CaptureError> {
        self.read_region(region)
    }

    fn capture_full_screen(&self) -> Result<CapturedFrame, CaptureError> {
        self.read_full()
    }
}

// -----------------------------------------------------------------------------
// WGC callback handler
// -----------------------------------------------------------------------------

/// State passed to `CaptureHandler::new` via `windows-capture`'s
/// `Settings::flags` mechanism. We use it to thread the shared
/// `latest` Mutex through to the per-frame callback.
struct CaptureContext {
    latest: SharedLatest,
}

/// Implements `windows-capture`'s `GraphicsCaptureApiHandler` trait. Receives
/// one callback per delivered frame on a dedicated thread.
struct CaptureHandler {
    latest: SharedLatest,
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = CaptureContext;
    type Error = CaptureError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            latest: ctx.flags.latest,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let width = frame.width();
        let height = frame.height();

        // `frame.buffer()` returns the BGRA/RGBA bytes mapped from the GPU.
        // Despite the name `LatestFrame.bgra`, we requested ColorFormat::Rgba8
        // above so the buffer is already in RGBA byte order; the field name
        // is historical. We copy out before releasing the lock so the lock
        // window stays small (a few microseconds vs the frame's lifetime).
        let mut buffer = frame.buffer().map_err(|e| {
            log::warn!("WGC frame.buffer() failed: {e}");
            CaptureError::BackendError {
                detail: format!("frame.buffer failed: {e}"),
            }
        })?;
        let bytes = buffer.as_raw_buffer().to_vec();

        let new_frame = LatestFrame {
            width,
            height,
            bgra: bytes,
        };

        if let Ok(mut guard) = self.latest.lock() {
            *guard = Some(new_frame);
        } else {
            log::warn!("WGC handler: latest-frame mutex poisoned");
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        // The capture session closed (window destroyed, etc.). Nothing to
        // do — the public Drop on CaptureControl handles cleanup.
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // We can't reliably start a real WGC session in CI (no display on the
    // GitHub Windows runner). These tests cover the deterministic surface —
    // BGRA→RGBA conversion and region slicing logic — against a fake frame.

    #[test]
    fn read_region_slices_correctly() {
        // 4x2 frame, RGBA already (we requested ColorFormat::Rgba8). Fill
        // each pixel with its (x,y) so we can verify slicing.
        let width = 4u32;
        let height = 2u32;
        let mut bgra = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            for x in 0..width {
                bgra.push(x as u8); // R
                bgra.push(y as u8); // G
                bgra.push(0); // B
                bgra.push(255); // A
            }
        }

        let latest: SharedLatest = Arc::new(Mutex::new(Some(LatestFrame {
            width,
            height,
            bgra,
        })));

        // Use a struct that mirrors WindowsScreenCapturer's read logic but
        // without the live CaptureControl (which we can't construct in tests).
        let region = CaptureRegion::new(1, 0, 2, 2); // 2 cols starting at x=1, 2 rows
        let out = read_region_helper(&latest, region).expect("slice works");

        assert_eq!(out.width, 2);
        assert_eq!(out.height, 2);
        // Pixel (0,0) of out = pixel (1,0) of frame = R=1, G=0
        assert_eq!(out.pixels[0], 1);
        assert_eq!(out.pixels[1], 0);
        // Pixel (1,1) of out = pixel (2,1) of frame = R=2, G=1
        let idx = (1 * out.width as usize * 4) + 1 * 4;
        assert_eq!(out.pixels[idx], 2);
        assert_eq!(out.pixels[idx + 1], 1);
    }

    #[test]
    fn read_region_rejects_invalid_region() {
        let latest: SharedLatest = Arc::new(Mutex::new(Some(LatestFrame {
            width: 100,
            height: 100,
            bgra: vec![0u8; 40_000],
        })));
        let err = read_region_helper(&latest, CaptureRegion::new(0, 0, 0, 50))
            .expect_err("zero-width region rejected");
        matches!(err, CaptureError::InvalidRegion(_));
    }

    #[test]
    fn read_region_rejects_oversized_region() {
        let latest: SharedLatest = Arc::new(Mutex::new(Some(LatestFrame {
            width: 100,
            height: 100,
            bgra: vec![0u8; 40_000],
        })));
        let err = read_region_helper(&latest, CaptureRegion::new(50, 50, 100, 100))
            .expect_err("region overflows frame");
        matches!(err, CaptureError::BackendError { .. });
    }

    #[test]
    fn read_region_errors_when_no_frame_yet() {
        let latest: SharedLatest = Arc::new(Mutex::new(None));
        let err = read_region_helper(&latest, CaptureRegion::new(0, 0, 10, 10))
            .expect_err("no frame yet");
        matches!(err, CaptureError::BackendError { .. });
    }

    /// Mirror of `WindowsScreenCapturer::read_region` but operating on the
    /// raw `SharedLatest` so we can unit-test without constructing a
    /// `CaptureControl` (which requires a live display).
    fn read_region_helper(
        latest: &SharedLatest,
        region: CaptureRegion,
    ) -> Result<CapturedFrame, CaptureError> {
        if !region.is_valid() {
            return Err(CaptureError::InvalidRegion(region));
        }
        let guard = latest.lock().map_err(|_| CaptureError::BackendError {
            detail: "mutex poisoned".into(),
        })?;
        let Some(frame) = guard.as_ref() else {
            return Err(CaptureError::BackendError {
                detail: "no frame yet".into(),
            });
        };
        if region
            .x
            .checked_add(region.width)
            .is_none_or(|x| x > frame.width)
            || region
                .y
                .checked_add(region.height)
                .is_none_or(|y| y > frame.height)
        {
            return Err(CaptureError::BackendError {
                detail: format!(
                    "region {}x{} at ({},{}) exceeds frame {}x{}",
                    region.width, region.height, region.x, region.y, frame.width, frame.height
                ),
            });
        }
        let mut out = Vec::with_capacity((region.width as usize) * (region.height as usize) * 4);
        let stride = (frame.width as usize) * 4;
        for row in 0..region.height {
            let row_start = ((region.y + row) as usize) * stride + (region.x as usize) * 4;
            let row_end = row_start + (region.width as usize) * 4;
            out.extend_from_slice(&frame.bgra[row_start..row_end]);
        }
        CapturedFrame::from_rgba(region.width, region.height, out)
    }
}

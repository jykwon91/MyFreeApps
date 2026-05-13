//! `FakeCapturer` — a cross-platform `ScreenCapturer` impl that returns a
//! canned frame from an in-memory buffer.
//!
//! Used by the CV pipeline tests on every CI runner (Linux/macOS/Windows) so
//! the same fixture exercise works on all of them. Also useful when running
//! `cargo tauri dev` on a machine without WGC (e.g., a remote Linux dev box)
//! — the pipeline can still run end-to-end against a fixture PNG.

use std::sync::Mutex;

use super::{CaptureError, CaptureRegion, CapturedFrame, MonitorResolution, ScreenCapturer};

/// In-memory capturer. Stores a single RGBA frame and returns it (or a
/// requested sub-region of it) on every `capture_region` call.
pub struct FakeCapturer {
    inner: Mutex<CapturedFrame>,
    /// Reported primary-monitor resolution. Defaults to the frame's own
    /// dimensions; tests can override via `with_resolution`.
    resolution: Mutex<MonitorResolution>,
}

impl FakeCapturer {
    /// Construct from an existing RGBA frame.
    pub fn from_frame(frame: CapturedFrame) -> Self {
        let resolution = MonitorResolution {
            width: frame.width,
            height: frame.height,
        };
        Self {
            inner: Mutex::new(frame),
            resolution: Mutex::new(resolution),
        }
    }

    /// Construct from a flat RGBA byte slice. Returns an error if the buffer
    /// length doesn't match `width * height * 4`.
    pub fn from_rgba(width: u32, height: u32, pixels: Vec<u8>) -> Result<Self, CaptureError> {
        let frame = CapturedFrame::from_rgba(width, height, pixels)?;
        Ok(Self::from_frame(frame))
    }

    /// Construct a solid-colour rectangle. Convenient for "always returns the
    /// same colour" tests.
    pub fn solid(width: u32, height: u32, rgba: [u8; 4]) -> Self {
        let mut buf = Vec::with_capacity((width as usize) * (height as usize) * 4);
        for _ in 0..(width as usize * height as usize) {
            buf.extend_from_slice(&rgba);
        }
        // We just built it; can't overflow.
        let frame = CapturedFrame::from_rgba(width, height, buf).expect("solid rgba valid");
        Self::from_frame(frame)
    }

    /// Replace the held frame at runtime. Used by tests that simulate the
    /// minimap changing (player walking).
    pub fn set_frame(&self, frame: CapturedFrame) {
        if let Ok(mut g) = self.inner.lock() {
            *g = frame;
        }
    }

    /// Override the reported primary-monitor resolution. Used by PR 9b
    /// tests covering `cv_get_primary_monitor_resolution`.
    pub fn with_resolution(self, resolution: MonitorResolution) -> Self {
        if let Ok(mut g) = self.resolution.lock() {
            *g = resolution;
        }
        self
    }
}

impl ScreenCapturer for FakeCapturer {
    fn capture_region(&self, region: CaptureRegion) -> Result<CapturedFrame, CaptureError> {
        if !region.is_valid() {
            return Err(CaptureError::InvalidRegion(region));
        }
        let g = self.inner.lock().map_err(|_| CaptureError::BackendError {
            detail: "fake-capturer mutex poisoned".into(),
        })?;
        if region
            .x
            .checked_add(region.width)
            .is_none_or(|x| x > g.width)
            || region
                .y
                .checked_add(region.height)
                .is_none_or(|y| y > g.height)
        {
            return Err(CaptureError::BackendError {
                detail: format!(
                    "region {}x{} at ({},{}) exceeds fake frame {}x{}",
                    region.width, region.height, region.x, region.y, g.width, g.height
                ),
            });
        }

        let mut out = Vec::with_capacity((region.width as usize) * (region.height as usize) * 4);
        let stride = (g.width as usize) * 4;
        for row in 0..region.height {
            let row_start = ((region.y + row) as usize) * stride + (region.x as usize) * 4;
            let row_end = row_start + (region.width as usize) * 4;
            out.extend_from_slice(&g.pixels[row_start..row_end]);
        }
        CapturedFrame::from_rgba(region.width, region.height, out)
    }

    fn capture_full_screen(&self) -> Result<CapturedFrame, CaptureError> {
        let g = self.inner.lock().map_err(|_| CaptureError::BackendError {
            detail: "fake-capturer mutex poisoned".into(),
        })?;
        Ok(g.clone())
    }

    fn primary_monitor_resolution(&self) -> Result<MonitorResolution, CaptureError> {
        let g = self.resolution.lock().map_err(|_| CaptureError::BackendError {
            detail: "fake-capturer resolution mutex poisoned".into(),
        })?;
        Ok(*g)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_capturer_returns_solid_colour() {
        let cap = FakeCapturer::solid(10, 10, [255, 0, 0, 255]);
        let frame = cap
            .capture_region(CaptureRegion::new(0, 0, 5, 5))
            .expect("captures");
        assert_eq!(frame.width, 5);
        assert_eq!(frame.height, 5);
        // First pixel R=255
        assert_eq!(frame.pixels[0], 255);
        assert_eq!(frame.pixels[1], 0);
    }

    #[test]
    fn fake_capturer_slices_subregion() {
        // 4-pixel-wide gradient: column x has R=x*40
        let mut buf = Vec::new();
        for _y in 0..2 {
            for x in 0..4u8 {
                buf.push(x * 40);
                buf.push(0);
                buf.push(0);
                buf.push(255);
            }
        }
        let cap = FakeCapturer::from_rgba(4, 2, buf).expect("valid");
        let frame = cap
            .capture_region(CaptureRegion::new(2, 0, 2, 2))
            .expect("captures");
        // Slice should start at x=2 → R=80
        assert_eq!(frame.pixels[0], 80);
        // Next column: x=3 → R=120
        assert_eq!(frame.pixels[4], 120);
    }

    #[test]
    fn fake_capturer_full_screen_returns_full_frame() {
        let cap = FakeCapturer::solid(8, 4, [10, 20, 30, 40]);
        let frame = cap.capture_full_screen().expect("full screen captures");
        assert_eq!(frame.width, 8);
        assert_eq!(frame.height, 4);
        assert_eq!(frame.pixels.len(), 8 * 4 * 4);
    }

    #[test]
    fn fake_capturer_rejects_oversized_region() {
        let cap = FakeCapturer::solid(10, 10, [0, 0, 0, 255]);
        let err = cap
            .capture_region(CaptureRegion::new(5, 5, 10, 10))
            .expect_err("too big");
        matches!(err, CaptureError::BackendError { .. });
    }

    #[test]
    fn fake_capturer_reports_default_resolution_matching_frame() {
        let cap = FakeCapturer::solid(640, 480, [0, 0, 0, 255]);
        let res = cap.primary_monitor_resolution().expect("resolution");
        assert_eq!(res.width, 640);
        assert_eq!(res.height, 480);
    }

    #[test]
    fn fake_capturer_with_resolution_overrides_default() {
        let cap = FakeCapturer::solid(640, 480, [0, 0, 0, 255]).with_resolution(MonitorResolution {
            width: 2560,
            height: 1440,
        });
        let res = cap.primary_monitor_resolution().expect("resolution");
        assert_eq!(res.width, 2560);
        assert_eq!(res.height, 1440);
    }
}

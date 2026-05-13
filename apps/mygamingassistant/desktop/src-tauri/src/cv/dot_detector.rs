//! Player-dot detection.
//!
//! Given a captured RGBA frame of the minimap region:
//!   1. Threshold pixels by Euclidean RGB distance from a target colour.
//!   2. Connected-component label the resulting binary mask.
//!   3. Filter components by area bounds (rules out single-pixel noise and
//!      large UI elements that happen to share a colour).
//!   4. Pick the most-confident component (closest mean colour to target).
//!   5. Return the component's centroid in minimap-pixel space.
//!
//! Returns `None` when no component passes the filters. The CV pipeline
//! treats this as "no zone change" and keeps the previous detection. Better
//! to occasionally miss a frame than emit a spurious zone change.
//!
//! Performance: this runs once per pipeline tick (50 ms interval). On a
//! 240x240 minimap region the inner loop is ~58k pixels — single-pass color
//! threshold + connected-component labelling completes in <2 ms on stock
//! hardware. imageproc's `connected_components` uses union-find under the
//! hood, which is the standard well-tuned algorithm.

use image::{ImageBuffer, Luma};
use imageproc::region_labelling::{connected_components, Connectivity};

#[cfg(test)]
use image::RgbaImage;

use crate::capture::CapturedFrame;
use crate::cv::calibration::DotDetectionParams;

/// Result of dot detection. All coords in minimap-pixel space (0,0 = top-left
/// of the captured minimap region).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DotDetection {
    /// Centroid x in minimap pixels.
    pub centroid_x: f32,
    /// Centroid y in minimap pixels.
    pub centroid_y: f32,
    /// Pixel area of the matching component. Use for diagnostics + ranking.
    pub area_px: u32,
    /// Mean Euclidean RGB distance to `target_rgb`. Lower = more confident.
    /// Range [0.0, ~441.0] (max distance in 3D RGB space).
    pub mean_distance: f32,
}

/// Detect the player's dot in the captured minimap frame.
///
/// `frame` MUST be RGBA8 (4 bytes per pixel, row-major). Returns `None` if
/// no component passes the colour + area filters.
pub fn detect_player_dot(
    frame: &CapturedFrame,
    params: &DotDetectionParams,
) -> Option<DotDetection> {
    if frame.width == 0 || frame.height == 0 {
        return None;
    }

    // Step 1: threshold into a binary mask (255 = candidate, 0 = background).
    let mask = build_color_mask(frame, params);

    // Step 2: label connected components. Connectivity::Four (4-neighbour)
    // is the right choice for tightly-grouped player dots — 8-neighbour
    // tends to merge nearby UI artefacts.
    let labels = connected_components(&mask, Connectivity::Four, Luma([0u8]));

    // Step 3 + 4: accumulate per-label area + colour-distance sum, then pick
    // the most-confident component.
    let mut best: Option<DotDetection> = None;
    let mut acc: ComponentAccumulators = ComponentAccumulators::default();
    acc.accumulate(&labels, frame, params);

    for (label, info) in acc.into_iter() {
        if label == 0 {
            // Label 0 = background per imageproc convention. Skip.
            continue;
        }
        if info.area < params.min_area_px || info.area > params.max_area_px {
            continue;
        }
        let mean_distance = info.distance_sum / (info.area as f32);
        let detection = DotDetection {
            centroid_x: info.sum_x / (info.area as f32),
            centroid_y: info.sum_y / (info.area as f32),
            area_px: info.area,
            mean_distance,
        };
        match &best {
            None => best = Some(detection),
            Some(prev) => {
                if detection.mean_distance < prev.mean_distance {
                    best = Some(detection);
                }
            }
        }
    }
    best
}

/// Per-component accumulators built up in a single pass over the labels image.
///
/// We don't know the label count up front, so we use a `Vec<Option<...>>`
/// indexed by label id. CC labels are dense from 0..n so this is the right
/// data structure. Avoids hash-map overhead in the hot loop.
#[derive(Default)]
struct ComponentAccumulators {
    inner: Vec<Option<ComponentInfo>>,
}

#[derive(Debug, Clone, Copy, Default)]
struct ComponentInfo {
    area: u32,
    sum_x: f32,
    sum_y: f32,
    distance_sum: f32,
}

impl ComponentAccumulators {
    /// Walk the labels image once, accumulating per-label totals from the
    /// matching RGBA frame.
    fn accumulate(
        &mut self,
        labels: &ImageBuffer<Luma<u32>, Vec<u32>>,
        frame: &CapturedFrame,
        params: &DotDetectionParams,
    ) {
        for (x, y, pixel) in labels.enumerate_pixels() {
            let label = pixel[0];
            if label == 0 {
                continue;
            }
            // RGBA byte index for (x, y).
            let idx = ((y as usize) * (frame.width as usize) + (x as usize)) * 4;
            let r = frame.pixels[idx];
            let g = frame.pixels[idx + 1];
            let b = frame.pixels[idx + 2];
            let d = color_distance([r, g, b], params.target_rgb);

            // Resize the vec if needed.
            let slot = label as usize;
            if self.inner.len() <= slot {
                self.inner.resize(slot + 1, None);
            }
            let entry = self.inner[slot].get_or_insert_with(ComponentInfo::default);
            entry.area += 1;
            entry.sum_x += x as f32;
            entry.sum_y += y as f32;
            entry.distance_sum += d;
        }
    }
}

impl IntoIterator for ComponentAccumulators {
    type Item = (u32, ComponentInfo);
    type IntoIter = ComponentAccumulatorsIter;

    fn into_iter(self) -> Self::IntoIter {
        ComponentAccumulatorsIter {
            inner: self.inner.into_iter(),
            idx: 0,
        }
    }
}

struct ComponentAccumulatorsIter {
    inner: std::vec::IntoIter<Option<ComponentInfo>>,
    idx: u32,
}

impl Iterator for ComponentAccumulatorsIter {
    type Item = (u32, ComponentInfo);
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let label = self.idx;
            self.idx = self.idx.checked_add(1)?;
            match self.inner.next()? {
                Some(info) => return Some((label, info)),
                None => continue,
            }
        }
    }
}

/// Build the binary "candidate / background" mask from an RGBA frame.
///
/// Pixels within `params.color_tolerance` Euclidean distance from
/// `params.target_rgb` are 255; everything else is 0.
fn build_color_mask(
    frame: &CapturedFrame,
    params: &DotDetectionParams,
) -> ImageBuffer<Luma<u8>, Vec<u8>> {
    let mut mask = ImageBuffer::new(frame.width, frame.height);
    // tolerance comparison done in squared-distance space to skip a sqrt
    // per pixel — a meaningful speedup over a naive impl.
    let tol = params.color_tolerance as f32;
    let tol_sq = tol * tol;
    for y in 0..frame.height {
        for x in 0..frame.width {
            let idx = ((y as usize) * (frame.width as usize) + (x as usize)) * 4;
            let r = frame.pixels[idx];
            let g = frame.pixels[idx + 1];
            let b = frame.pixels[idx + 2];
            let dsq = squared_color_distance([r, g, b], params.target_rgb);
            let v = if dsq <= tol_sq { 255 } else { 0 };
            mask.put_pixel(x, y, Luma([v]));
        }
    }
    mask
}

/// Euclidean RGB distance. Squared variant used in the hot loop to avoid
/// repeated sqrts; this version is exposed for `mean_distance` reporting.
fn color_distance(a: [u8; 3], b: [u8; 3]) -> f32 {
    squared_color_distance(a, b).sqrt()
}

fn squared_color_distance(a: [u8; 3], b: [u8; 3]) -> f32 {
    let dr = a[0] as f32 - b[0] as f32;
    let dg = a[1] as f32 - b[1] as f32;
    let db = a[2] as f32 - b[2] as f32;
    dr * dr + dg * dg + db * db
}

/// Render an RGBA frame from imageproc's image format. Helper for tests.
#[cfg(test)]
pub(crate) fn rgba_from_image(img: &RgbaImage) -> CapturedFrame {
    let pixels = img.as_raw().clone();
    let w = img.width();
    let h = img.height();
    CapturedFrame::from_rgba(w, h, pixels).expect("valid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba as ImgRgba;

    fn make_params() -> DotDetectionParams {
        DotDetectionParams {
            target_rgb: [255, 255, 0],
            color_tolerance: 20,
            min_area_px: 4,
            max_area_px: 100,
        }
    }

    /// Helper: blank image + paint a solid coloured square at (x, y).
    fn frame_with_square(
        width: u32,
        height: u32,
        bg: [u8; 4],
        x0: u32,
        y0: u32,
        size: u32,
        color: [u8; 4],
    ) -> CapturedFrame {
        let mut img = RgbaImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                img.put_pixel(x, y, ImgRgba(bg));
            }
        }
        for y in y0..(y0 + size) {
            for x in x0..(x0 + size) {
                if x < width && y < height {
                    img.put_pixel(x, y, ImgRgba(color));
                }
            }
        }
        rgba_from_image(&img)
    }

    #[test]
    fn detects_yellow_square_centroid() {
        // 30x30 background grey + 6x6 yellow square at (10, 10).
        // Centroid should be (12.5, 12.5) (center of pixels 10..15).
        let frame = frame_with_square(
            30,
            30,
            [80, 80, 80, 255],
            10,
            10,
            6,
            [255, 255, 0, 255],
        );
        let det = detect_player_dot(&frame, &make_params()).expect("detects");
        assert_eq!(det.area_px, 36);
        assert!((det.centroid_x - 12.5).abs() < 0.01);
        assert!((det.centroid_y - 12.5).abs() < 0.01);
        assert!(det.mean_distance < 1.0); // exact-color match
    }

    #[test]
    fn returns_none_when_no_pixels_match() {
        // All-grey frame; no yellow anywhere.
        let frame = frame_with_square(
            20,
            20,
            [80, 80, 80, 255],
            0,
            0,
            0,
            [0, 0, 0, 0],
        );
        assert!(detect_player_dot(&frame, &make_params()).is_none());
    }

    #[test]
    fn returns_none_when_components_too_small() {
        // 2x2 yellow square (area 4) — but our min_area is 5 here.
        let frame = frame_with_square(
            20,
            20,
            [80, 80, 80, 255],
            5,
            5,
            2,
            [255, 255, 0, 255],
        );
        let mut params = make_params();
        params.min_area_px = 5;
        assert!(detect_player_dot(&frame, &params).is_none());
    }

    #[test]
    fn returns_none_when_components_too_large() {
        // Fill almost-everything yellow (area > max).
        let frame = frame_with_square(
            30,
            30,
            [80, 80, 80, 255],
            0,
            0,
            29,
            [255, 255, 0, 255],
        );
        let mut params = make_params();
        params.max_area_px = 50;
        assert!(detect_player_dot(&frame, &params).is_none());
    }

    #[test]
    fn picks_best_of_multiple_candidates() {
        // Two squares: one exact yellow (low distance), one near-yellow
        // (higher distance). The exact one should win.
        let mut img = RgbaImage::new(40, 20);
        for y in 0..20 {
            for x in 0..40 {
                img.put_pixel(x, y, ImgRgba([80, 80, 80, 255]));
            }
        }
        // Exact yellow at (5, 5), size 4 — area 16
        for y in 5..9 {
            for x in 5..9 {
                img.put_pixel(x, y, ImgRgba([255, 255, 0, 255]));
            }
        }
        // Near-yellow at (25, 5), size 4 — area 16, color within tolerance
        // (255, 240, 0) is dist ~15, still within tolerance=20
        for y in 5..9 {
            for x in 25..29 {
                img.put_pixel(x, y, ImgRgba([255, 240, 0, 255]));
            }
        }
        let frame = rgba_from_image(&img);
        let det = detect_player_dot(&frame, &make_params()).expect("detects");
        // Best should be the exact-yellow patch at centroid (6.5, 6.5)
        assert!((det.centroid_x - 6.5).abs() < 0.5);
        assert!((det.centroid_y - 6.5).abs() < 0.5);
        assert!(det.mean_distance < 1.0);
    }

    #[test]
    fn color_distance_zero_for_identical() {
        assert!((color_distance([100, 50, 200], [100, 50, 200]) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn color_distance_matches_euclidean() {
        // (3, 4, 0) distance from origin = 5
        let d = color_distance([3, 4, 0], [0, 0, 0]);
        assert!((d - 5.0).abs() < 1e-6);
    }

    #[test]
    fn empty_frame_returns_none() {
        let frame = CapturedFrame::from_rgba(0, 0, vec![]).unwrap_or(CapturedFrame {
            width: 0,
            height: 0,
            pixels: vec![],
        });
        assert!(detect_player_dot(&frame, &make_params()).is_none());
    }
}

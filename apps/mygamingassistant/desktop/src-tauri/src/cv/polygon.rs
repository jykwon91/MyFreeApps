//! Point-in-polygon test via ray casting (a.k.a. crossing number / "Jordan
//! curve" algorithm).
//!
//! Why ray casting and not winding number:
//!   - For simple (non-self-intersecting) polygons like map zones, both give
//!     the same answer.
//!   - Ray casting is fewer lines, fewer divisions, fewer chances for
//!     floating-point edge cases.
//!   - Map zone polygons are user-authored and almost always convex or
//!     mildly concave — no pathological cases.
//!
//! Edge cases handled:
//!   - Points exactly ON a polygon edge: treated as INSIDE (per the convention
//!     used by SVG `pointer-events` and most game-zone systems). Cleanest
//!     behaviour for the operator — clicking a zone boundary still selects
//!     the zone.
//!   - Horizontal edges: skipped from the crossing count (the ray would
//!     parallel them).
//!   - Vertices ON the ray: the standard trick is to consider the lower
//!     vertex of each edge "owned" by the edge above it, avoiding double
//!     counting. We implement this by using strict inequality on the upper
//!     vertex.

use crate::cv::calibration::ZonePolygon;

/// Test whether `(px, py)` is inside `polygon.points`.
///
/// Points on the polygon boundary are considered INSIDE.
pub fn point_in_polygon(px: f32, py: f32, points: &[(f32, f32)]) -> bool {
    let n = points.len();
    if n < 3 {
        return false;
    }

    // Quick boundary check via on-edge test. We do this first so the boundary
    // case is unambiguous regardless of ray-casting parity oddities.
    for i in 0..n {
        let (ax, ay) = points[i];
        let (bx, by) = points[(i + 1) % n];
        if point_on_segment(px, py, ax, ay, bx, by) {
            return true;
        }
    }

    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = points[i];
        let (xj, yj) = points[j];

        // Edge crosses the horizontal ray (going right from (px, py))?
        // Use [yi > py] != [yj > py] — handles vertices on the ray correctly.
        let crosses = (yi > py) != (yj > py);
        if crosses {
            // x coordinate where the edge crosses y=py
            let x_intersect = xi + (py - yi) * (xj - xi) / (yj - yi);
            if px < x_intersect {
                inside = !inside;
            }
        }
        j = i;
    }
    inside
}

/// Test whether `(px, py)` is on the line segment from `(ax,ay)` to `(bx,by)`.
///
/// Floating-point epsilon is sized for normalized 0-1 polygon coords;
/// 1e-5 corresponds to ~1 pixel on a 100x100 minimap. Fine for our purposes.
fn point_on_segment(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> bool {
    const EPS: f32 = 1e-5;
    // Cross product of (b-a) and (p-a) — zero (within EPS) iff colinear.
    let cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if cross.abs() > EPS {
        return false;
    }
    // Within the bounding box of (a, b)?
    let in_x = (ax.min(bx) - EPS..=ax.max(bx) + EPS).contains(&px);
    let in_y = (ay.min(by) - EPS..=ay.max(by) + EPS).contains(&py);
    in_x && in_y
}

/// Find the zone containing `(world_x, world_y)`. Returns the slug of the
/// first matching zone, or `None`.
///
/// Iteration order matters when zones overlap (which they shouldn't, but
/// authoring mistakes happen). We return the FIRST match — the operator can
/// reorder the zone list in the calibration JSON to disambiguate if needed.
pub fn find_zone<'a>(world_x: f32, world_y: f32, zones: &'a [ZonePolygon]) -> Option<&'a str> {
    zones
        .iter()
        .find(|z| point_in_polygon(world_x, world_y, &z.points))
        .map(|z| z.slug.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_square() -> Vec<(f32, f32)> {
        vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    }

    #[test]
    fn point_inside_unit_square() {
        assert!(point_in_polygon(0.5, 0.5, &unit_square()));
        assert!(point_in_polygon(0.1, 0.1, &unit_square()));
        assert!(point_in_polygon(0.9, 0.9, &unit_square()));
    }

    #[test]
    fn point_outside_unit_square() {
        assert!(!point_in_polygon(-0.1, 0.5, &unit_square()));
        assert!(!point_in_polygon(1.5, 0.5, &unit_square()));
        assert!(!point_in_polygon(0.5, -0.1, &unit_square()));
        assert!(!point_in_polygon(0.5, 1.5, &unit_square()));
    }

    #[test]
    fn point_on_corner_is_inside() {
        assert!(point_in_polygon(0.0, 0.0, &unit_square()));
        assert!(point_in_polygon(1.0, 1.0, &unit_square()));
    }

    #[test]
    fn point_on_edge_is_inside() {
        assert!(point_in_polygon(0.5, 0.0, &unit_square())); // bottom edge
        assert!(point_in_polygon(1.0, 0.5, &unit_square())); // right edge
        assert!(point_in_polygon(0.5, 1.0, &unit_square())); // top edge
        assert!(point_in_polygon(0.0, 0.5, &unit_square())); // left edge
    }

    #[test]
    fn concave_polygon() {
        // L-shape (concave). Points (0.25, 0.75) should be OUTSIDE the L's
        // concavity, point (0.25, 0.25) inside.
        let l_shape = vec![
            (0.0, 0.0),
            (0.5, 0.0),
            (0.5, 0.5),
            (1.0, 0.5),
            (1.0, 1.0),
            (0.0, 1.0),
        ];
        assert!(point_in_polygon(0.25, 0.25, &l_shape));
        assert!(point_in_polygon(0.75, 0.75, &l_shape));
        // The concavity: notch from (0.5, 0) to (1, 0.5)
        assert!(!point_in_polygon(0.75, 0.25, &l_shape));
    }

    #[test]
    fn triangle() {
        let tri = vec![(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)];
        assert!(point_in_polygon(0.5, 0.3, &tri));
        assert!(!point_in_polygon(0.1, 0.9, &tri));
    }

    #[test]
    fn degenerate_polygons_return_false() {
        // Fewer than 3 vertices is not a polygon.
        assert!(!point_in_polygon(0.5, 0.5, &[]));
        assert!(!point_in_polygon(0.5, 0.5, &[(0.0, 0.0)]));
        assert!(!point_in_polygon(0.5, 0.5, &[(0.0, 0.0), (1.0, 1.0)]));
    }

    #[test]
    fn find_zone_returns_matching_slug() {
        let zones = vec![
            ZonePolygon {
                slug: "a-site".into(),
                name: "A Site".into(),
                points: vec![(0.0, 0.0), (0.4, 0.0), (0.4, 0.4), (0.0, 0.4)],
            },
            ZonePolygon {
                slug: "b-site".into(),
                name: "B Site".into(),
                points: vec![(0.6, 0.6), (1.0, 0.6), (1.0, 1.0), (0.6, 1.0)],
            },
        ];
        assert_eq!(find_zone(0.2, 0.2, &zones), Some("a-site"));
        assert_eq!(find_zone(0.8, 0.8, &zones), Some("b-site"));
        // Gap between zones
        assert_eq!(find_zone(0.5, 0.5, &zones), None);
    }

    #[test]
    fn find_zone_returns_first_match_on_overlap() {
        // Overlapping zones — first in the list wins.
        let zones = vec![
            ZonePolygon {
                slug: "outer".into(),
                name: "Outer".into(),
                points: vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
            },
            ZonePolygon {
                slug: "inner".into(),
                name: "Inner".into(),
                points: vec![(0.2, 0.2), (0.4, 0.2), (0.4, 0.4), (0.2, 0.4)],
            },
        ];
        assert_eq!(find_zone(0.3, 0.3, &zones), Some("outer"));
    }
}

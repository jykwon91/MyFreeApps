/**
 * RegionPanel — Job 1: pick the minimap rectangle on your screen.
 *
 * Two-card layout:
 *   - Left card: capture trigger + corner picker (or numeric inputs).
 *   - Right card: cropped preview.
 *
 * The panel doesn't own the capture state — it just calls the parent's
 * `useCaptureSnapshot.capture()` and feeds the resulting PNG into the
 * picker. The draft reducer keeps the actual region in sync.
 */
import { useEffect, useState } from "react";
import { Card, LoadingButton, AlertBox } from "@platform/ui";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import RegionCornerPicker from "./RegionCornerPicker";
import RegionNumericFallback from "./RegionNumericFallback";
import RegionCroppedPreview from "./RegionCroppedPreview";
import SectionSaveBar from "../shared/SectionSaveBar";
import type { UseCaptureSnapshot } from "@/hooks/useCaptureSnapshot";
import { regionFromCorners } from "@/lib/calibration";
import type { CvCaptureRegion, CvMonitorResolution } from "@/types/desktop";
import type { CornerPoint } from "./RegionCornerPicker";

interface RegionPanelProps {
  region: CvCaptureRegion;
  detectedResolution: CvMonitorResolution | null;
  isDirty: boolean;
  isSaving: boolean;
  snapshotHook: UseCaptureSnapshot;
  onRegionChange: (region: CvCaptureRegion) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  /** Recapture screen — wired to keyboard shortcut `r`. */
  recaptureKey?: number;
}

export default function RegionPanel({
  region,
  detectedResolution,
  isDirty,
  isSaving,
  snapshotHook,
  onRegionChange,
  onSave,
  onReset,
  recaptureKey,
}: RegionPanelProps) {
  const [useNumeric, setUseNumeric] = useState(false);
  const [corners, setCorners] = useState<CornerPoint[]>([]);

  // When `region` matches a non-default rect, seed the corners as the four
  // bbox vertices. This lets the operator switch between picker + numeric
  // modes without losing position info.
  useEffect(() => {
    if (region.width <= 0 || region.height <= 0) return;
    setCorners([
      { x: region.x, y: region.y },
      { x: region.x + region.width, y: region.y },
      { x: region.x + region.width, y: region.y + region.height },
      { x: region.x, y: region.y + region.height },
    ]);
  }, [region.x, region.y, region.width, region.height]);

  // Trigger recapture when the keyboard shortcut fires.
  useEffect(() => {
    if (recaptureKey && recaptureKey > 0) {
      void snapshotHook.capture().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recaptureKey]);

  function handleCorners(next: CornerPoint[]) {
    setCorners(next);
    if (next.length === 4) {
      const r = regionFromCorners(next);
      if (r) onRegionChange(r);
    }
  }

  async function handleCapture() {
    try {
      await snapshotHook.capture();
      setCorners([]); // Reset corners — operator is re-marking.
    } catch {
      // Error surfaced via snapshotHook.error below.
    }
  }

  const snap = snapshotHook.snapshot;
  const fallbackMax = detectedResolution
    ? { width: detectedResolution.width, height: detectedResolution.height }
    : { width: 4096, height: 2160 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Capture + mark corners">
          <div className="space-y-3">
            {snapshotHook.error && (
              <AlertBox variant="error">
                <div className="space-y-1">
                  <p className="font-medium">Couldn't capture screen.</p>
                  <p className="text-xs">{snapshotHook.error}</p>
                  <p className="text-xs">
                    Is the CV pipeline running?{" "}
                    <Link
                      to="/live/cs2/setup"
                      className="underline inline-flex items-center gap-1"
                    >
                      Open Setup
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </p>
                </div>
              </AlertBox>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <LoadingButton
                isLoading={snapshotHook.isLoading}
                loadingText="Capturing..."
                onClick={handleCapture}
              >
                {snap ? "Recapture screen" : "Capture screen"}
              </LoadingButton>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={useNumeric}
                  onChange={(e) => setUseNumeric(e.target.checked)}
                />
                Use numeric values instead
              </label>
            </div>

            {useNumeric ? (
              <RegionNumericFallback
                region={region}
                onChange={onRegionChange}
                maxWidth={fallbackMax.width}
                maxHeight={fallbackMax.height}
              />
            ) : snap ? (
              <RegionCornerPicker
                pngBase64={snap.png_base64}
                fullWidth={snap.width}
                fullHeight={snap.height}
                corners={corners}
                onCornersChange={handleCorners}
              />
            ) : (
              <div className="rounded-md border-2 border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground text-center">
                Click "Capture screen" to take a fresh screenshot to mark up.
              </div>
            )}
          </div>
        </Card>

        <Card title="Cropped preview">
          {snap ? (
            <RegionCroppedPreview
              pngBase64={snap.png_base64}
              fullWidth={snap.width}
              fullHeight={snap.height}
              region={region}
            />
          ) : (
            <div className="rounded-md border-2 border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground text-center">
              Preview shows up after capture.
            </div>
          )}
        </Card>
      </div>

      <SectionSaveBar
        section="region"
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={onSave}
        onReset={onReset}
      />
    </div>
  );
}

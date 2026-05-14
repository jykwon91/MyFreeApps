/**
 * DotsPanel — Job 3: tune player-dot detection params live.
 *
 * Left column: swatch + tolerance + area sliders + "pick from screen".
 * Right column: live preview powered by `cv:debug-frame` events.
 *
 * Live tuning model:
 *   - Every slider change calls `cv_set_dot_params_preview(params)` so the
 *     running pipeline starts using the new params on its next tick. NO
 *     persistence until the operator hits Save.
 *   - Cancel rolls the pipeline back to the last-saved params (snapshotted
 *     on mount).
 *   - Unmount cleanup re-applies the last-saved params so previewed-but-
 *     unsaved edits don't leak into a different page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, AlertBox, showError } from "@platform/ui";
import DotColorSwatch from "./DotColorSwatch";
import DotTolerance from "./DotTolerance";
import DotAreaRange from "./DotAreaRange";
import DotLivePreview from "./DotLivePreview";
import DotPickFromScreen from "./DotPickFromScreen";
import SectionSaveBar from "../shared/SectionSaveBar";
import { invokeTauri, isTauri } from "@/lib/tauri";
import { useCvDebugFrame } from "@/hooks/useCvDebugFrame";
import type {
  CvCaptureFrameResult,
  CvCaptureRegion,
  CvDotDetectionParams,
  CvSetDotParamsPreviewResult,
} from "@/types/desktop";

interface DotsPanelProps {
  /** Current draft params (changes on every slider tick). */
  params: CvDotDetectionParams;
  /** Last-saved baseline params — used by Cancel + cleanup. */
  loadedParams: CvDotDetectionParams;
  /** Cropped minimap region — needed for the pick-from-screen UI. */
  region: CvCaptureRegion;
  /** True when the CV pipeline is running. */
  pipelineRunning: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onParamsChange: (params: CvDotDetectionParams) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  onStartPipeline: () => void | Promise<void>;
}

export default function DotsPanel({
  params,
  loadedParams,
  region,
  pipelineRunning,
  isDirty,
  isSaving,
  onParamsChange,
  onSave,
  onReset,
  onStartPipeline,
}: DotsPanelProps) {
  const { frame, ready, secondsSinceLast } = useCvDebugFrame();
  const [pickSnapshot, setPickSnapshot] = useState<CvCaptureFrameResult | null>(null);
  const [picking, setPicking] = useState(false);

  // Snapshot the params at mount so Cancel reverts to "what we had on
  // entry to this page" rather than "what we last saved". The two are
  // usually the same; the snapshot diverges when the operator navigates
  // away and comes back without saving.
  const initialParamsRef = useRef<CvDotDetectionParams>(loadedParams);

  // Hot-swap on every params change so the live preview reflects the
  // current draft. Fire-and-forget — if the pipeline isn't running, the
  // command returns `applied: false` and the UI keeps working.
  useEffect(() => {
    if (!isTauri()) return;
    void invokeTauri<CvSetDotParamsPreviewResult>(
      "cv_set_dot_params_preview",
      { params },
    ).catch(() => undefined);
  }, [params]);

  // Cleanup on unmount: revert the live pipeline to the LAST-SAVED params
  // so previewed-but-unsaved tweaks don't survive page leave. We use
  // `loadedParams` (the baseline) rather than `initialParamsRef.current`
  // because saving mid-session can update the baseline.
  useEffect(() => {
    return () => {
      if (!isTauri()) return;
      void invokeTauri<CvSetDotParamsPreviewResult>(
        "cv_set_dot_params_preview",
        { params: loadedParams },
      ).catch(() => undefined);
    };
    // We intentionally omit `loadedParams` from deps — this cleanup only
    // fires on unmount. Re-running on every params change would constantly
    // revert the live preview, defeating the live-tuning UX.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChannelChange = useCallback(
    (rgb: [number, number, number]) => {
      onParamsChange({ ...params, target_rgb: rgb });
    },
    [params, onParamsChange],
  );

  const handleToleranceChange = useCallback(
    (t255: number) => {
      onParamsChange({ ...params, color_tolerance: t255 });
    },
    [params, onParamsChange],
  );

  const handleAreaChange = useCallback(
    (min: number, max: number) => {
      onParamsChange({ ...params, min_area_px: min, max_area_px: max });
    },
    [params, onParamsChange],
  );

  const handlePickFromScreen = useCallback(async () => {
    if (!isTauri()) return;
    setPicking(true);
    try {
      const snap = await invokeTauri<CvCaptureFrameResult>("cv_capture_frame");
      setPickSnapshot(snap);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      showError(`Couldn't capture screen: ${m}`);
    } finally {
      setPicking(false);
    }
  }, []);

  const handlePicked = useCallback(
    (rgb: [number, number, number], tolerance: number) => {
      onParamsChange({ ...params, target_rgb: rgb, color_tolerance: tolerance });
      setPickSnapshot(null);
    },
    [params, onParamsChange],
  );

  const handleCancelPreview = useCallback(() => {
    // Revert to the captured-on-mount params (pipeline rolls back too via
    // the params-change useEffect above).
    onParamsChange(initialParamsRef.current);
  }, [onParamsChange]);

  // Tolerance keyboard shortcuts: `[` decrement, `]` increment (1 unit each).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        e.preventDefault();
        handleToleranceChange(Math.max(0, params.color_tolerance - 1));
      } else if (e.key === "]") {
        e.preventDefault();
        handleToleranceChange(Math.min(255, params.color_tolerance + 1));
      } else if (e.key === "p") {
        const onPick = handlePickFromScreen;
        e.preventDefault();
        void onPick();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [params.color_tolerance, handleToleranceChange, handlePickFromScreen]);

  return (
    <div className="space-y-4">
      {!pipelineRunning && (
        <AlertBox variant="info">
          Live preview only updates while the CV pipeline is running. You can
          still tune the params now — they apply the moment the pipeline
          starts.
        </AlertBox>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Parameters">
          {pickSnapshot ? (
            <DotPickFromScreen
              pngBase64={pickSnapshot.png_base64}
              fullWidth={pickSnapshot.width}
              fullHeight={pickSnapshot.height}
              region={region}
              onPicked={handlePicked}
              onCancel={() => setPickSnapshot(null)}
            />
          ) : (
            <div className="space-y-4">
              <DotColorSwatch
                rgb={params.target_rgb}
                onChange={handleChannelChange}
                onPickFromScreen={handlePickFromScreen}
                isPicking={picking}
              />
              <DotTolerance
                tolerance255={params.color_tolerance}
                onChange={handleToleranceChange}
              />
              <DotAreaRange
                min={params.min_area_px}
                max={params.max_area_px}
                onChange={handleAreaChange}
              />
            </div>
          )}
        </Card>

        <DotLivePreview
          frame={frame}
          ready={ready}
          pipelineRunning={pipelineRunning}
          secondsSinceLast={secondsSinceLast}
          onStartPipeline={onStartPipeline}
        />
      </div>

      <SectionSaveBar
        section="dots"
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={onSave}
        onReset={onReset}
        onCancel={handleCancelPreview}
        cancelLabel="Cancel preview overrides"
      />
    </div>
  );
}

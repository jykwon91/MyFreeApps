/**
 * useTrimPreviewVideo unit tests — PR3 trim-panel live preview.
 *
 * The hook owns a `<video>` element's lifecycle (seek + play + loop +
 * error). We render a minimal TestHarness rather than ``renderHook`` so
 * the returned ``videoRef`` actually attaches to a real element — the
 * hook's effects only fire once ``videoRef.current`` is non-null.
 *
 * jsdom doesn't implement HTMLMediaElement.play / pause natively (they
 * warn and return undefined), so we spy + mock both. ``currentTime`` IS
 * implemented as a getter/setter on the prototype, so we can read it
 * back directly to verify seek positions.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import {
  useTrimPreviewVideo,
  type TrimPreviewThumb,
} from "@/hooks/useTrimPreviewVideo";

interface TestHarnessProps {
  clipUrl: string;
  startOffsetS: number;
  endOffsetS: number;
  activeThumb: TrimPreviewThumb;
}

/** Render the hook with a real `<video>` element so the ref attaches. */
function TestHarness({ clipUrl, startOffsetS, endOffsetS, activeThumb }: TestHarnessProps) {
  const { videoRef, isSeeking, hasError } = useTrimPreviewVideo({
    clipUrl,
    startOffsetS,
    endOffsetS,
    activeThumb,
  });
  return (
    <>
      <video ref={videoRef} src={clipUrl} data-testid="preview-video" />
      <div data-testid="seeking">{String(isSeeking)}</div>
      <div data-testid="error">{String(hasError)}</div>
    </>
  );
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  pauseSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTrimPreviewVideo", () => {
  // -------------------------------------------------------------------------
  // Idle (no drag)
  // -------------------------------------------------------------------------

  it("on mount with no active thumb, seeks to startOffsetS and plays (loop)", () => {
    const { getByTestId } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={1.5}
        endOffsetS={4}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(video.currentTime).toBe(1.5);
    expect(playSpy).toHaveBeenCalled();
  });

  it("when timeupdate crosses endOffsetS, currentTime wraps back to startOffsetS", () => {
    const { getByTestId } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={2}
        endOffsetS={4}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    // Move past the end manually + fire timeupdate; the hook's listener
    // should reset to startOffsetS.
    video.currentTime = 4.2;
    act(() => {
      fireEvent(video, new Event("timeupdate"));
    });
    expect(video.currentTime).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Drag
  // -------------------------------------------------------------------------

  it("dragging the start thumb pauses and seeks to startOffsetS", () => {
    const { getByTestId, rerender } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    pauseSpy.mockClear();

    rerender(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={1.2}
        endOffsetS={5}
        activeThumb="start"
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(pauseSpy).toHaveBeenCalled();
    expect(video.currentTime).toBe(1.2);
  });

  it("dragging the end thumb pauses and seeks to endOffsetS", () => {
    const { getByTestId, rerender } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    pauseSpy.mockClear();

    rerender(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={3.7}
        activeThumb="end"
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(pauseSpy).toHaveBeenCalled();
    expect(video.currentTime).toBe(3.7);
  });

  it("releasing the drag (activeThumb back to null) restarts the loop from startOffsetS", () => {
    const { getByTestId, rerender } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb="start"
      />,
    );
    playSpy.mockClear();

    rerender(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={1}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(video.currentTime).toBe(1);
    expect(playSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Seek state surfacing
  // -------------------------------------------------------------------------

  it("isSeeking is true between `seeking` and `seeked` events", () => {
    const { getByTestId } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(getByTestId("seeking").textContent).toBe("false");

    act(() => {
      fireEvent(video, new Event("seeking"));
    });
    expect(getByTestId("seeking").textContent).toBe("true");

    act(() => {
      fireEvent(video, new Event("seeked"));
    });
    expect(getByTestId("seeking").textContent).toBe("false");
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("hasError flips to true when the video element fires `error`", () => {
    const { getByTestId } = render(
      <TestHarness
        clipUrl="https://ex/clip.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    expect(getByTestId("error").textContent).toBe("false");

    act(() => {
      fireEvent(video, new Event("error"));
    });
    expect(getByTestId("error").textContent).toBe("true");
  });

  it("hasError resets when the clipUrl prop changes (presigned URL rotation)", () => {
    const { getByTestId, rerender } = render(
      <TestHarness
        clipUrl="https://ex/clip-v1.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    const video = getByTestId("preview-video") as HTMLVideoElement;
    act(() => {
      fireEvent(video, new Event("error"));
    });
    expect(getByTestId("error").textContent).toBe("true");

    rerender(
      <TestHarness
        clipUrl="https://ex/clip-v2.mp4"
        startOffsetS={0}
        endOffsetS={5}
        activeThumb={null}
      />,
    );
    expect(getByTestId("error").textContent).toBe("false");
  });
});

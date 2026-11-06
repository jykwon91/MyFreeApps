import { useEffect, useRef } from "react";

interface PreviewVideoProps {
  widerSourceUrl: string;
  offsetS: number;
}

export default function PreviewVideo({ widerSourceUrl, offsetS }: PreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Seek on offset change. ``preload="auto"`` ensures the browser keeps
    // enough buffered around the seek point for a snappy scrub. The
    // currentTime assignment may throw before metadata loads (esp. on
    // first mount); swallow + retry on next render is the documented
    // behaviour for media-elements.
    try {
      v.currentTime = offsetS;
    } catch {
      /* metadata not yet loaded — next render will retry on offset change */
    }
  }, [offsetS]);

  return (
    <video
      ref={videoRef}
      src={widerSourceUrl}
      muted
      playsInline
      preload="auto"
      aria-hidden
      className="w-full aspect-video object-cover rounded-sm"
    />
  );
}

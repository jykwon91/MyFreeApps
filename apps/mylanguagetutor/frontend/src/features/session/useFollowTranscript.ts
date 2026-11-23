import { useEffect, useRef } from "react";
import { STICK_TO_BOTTOM_DISTANCE } from "@/constants/transcriptScroll";
import { isNearBottom } from "@mylanguagetutor/api-client/utils/isNearBottom";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

/**
 * Keeps the end of the transcript in view as it grows, unless the reader has scrolled up to
 * read an earlier message. Starting a new turn always brings the reader back to the end.
 * Returns the ref to put on an element at the end of the transcript.
 */
export function useFollowTranscript(newestKey: string | undefined, entries: readonly TranscriptEntry[], waiting: boolean) {
  const end = useRef<HTMLDivElement>(null);
  const isFollowing = useRef(true);
  const followedKey = useRef(newestKey);

  useEffect(() => {
    let lastY = window.scrollY;
    // Only scrolling up stops following. A smooth scroll to the end passes through points far
    // from it, and those must not switch following off.
    const onScroll = () => {
      const y = window.scrollY;
      const nearEnd = isNearBottom(
        {
          contentOffset: { y },
          contentSize: { height: document.documentElement.scrollHeight },
          layoutMeasurement: { height: window.innerHeight },
        },
        STICK_TO_BOTTOM_DISTANCE,
      );
      if (y < lastY) isFollowing.current = nearEnd;
      else if (nearEnd) isFollowing.current = true;
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (followedKey.current !== newestKey) {
      followedKey.current = newestKey;
      isFollowing.current = true;
    }
    if (isFollowing.current) end.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [newestKey, entries, waiting]);

  return end;
}

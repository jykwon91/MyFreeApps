import { useEffect, useState } from "react";
import { Image, type ImageErrorEvent } from "react-native";
import type { ThumbnailProps } from "../types/ThumbnailProps";
import { remoteUri } from "../utils/remoteUri";
import ThumbnailFailure from "./ThumbnailFailure";

/**
 * A photo shown in a small box. Without `resizeMethod="resize"` Android decodes the whole file
 * (about 48 MB for a 12 MP camera photo) to fill a box a few dozen pixels wide; with it the
 * picture is downsampled to the size of the view, so several photos don't exhaust memory.
 * Use it for every small local or remote photo; full-size viewers keep a plain Image.
 *
 * Given `failedMessage`, a photo that can't load (offline, or a signed link that has expired) turns
 * into a tile saying so, with `onRetry` a button that asks for fresh links and tries again, instead
 * of staying a blank box.
 */
export default function Thumbnail({ failedMessage, onRetry, retryLabel, failedColors, hideFailedText = false, onFailedChange, onError, ...props }: ThumbnailProps) {
  const uri = remoteUri(props.source);
  // The link that failed, so a fresh one (after a refetch) gets a fresh try without any reset.
  const [failedUri, setFailedUri] = useState<string | undefined | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasFailed = failedUri === uri;

  useEffect(() => {
    onFailedChange?.(false);
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  function fail(event: ImageErrorEvent): void {
    onError?.(event);
    if (!failedMessage) return;
    setFailedUri(uri);
    onFailedChange?.(true);
  }

  function retry(): void {
    setFailedUri(null);
    setAttempt((current) => current + 1);
    onFailedChange?.(false);
    onRetry?.();
  }

  if (failedMessage && hasFailed) {
    return (
      <ThumbnailFailure
        hideText={hideFailedText}
        message={failedMessage}
        onRetry={onRetry ? retry : undefined}
        retryLabel={retryLabel}
        style={props.style}
        testID={props.testID}
        colors={failedColors}
      />
    );
  }

  // iOS only makes an Image an accessibility element when told to, so a bare label is never read.
  const isLabelled = Boolean(props.accessibilityLabel ?? props.alt);
  return <Image accessible={isLabelled} accessibilityRole={isLabelled ? "image" : undefined} key={attempt} {...props} onError={fail} resizeMethod="resize" />;
}

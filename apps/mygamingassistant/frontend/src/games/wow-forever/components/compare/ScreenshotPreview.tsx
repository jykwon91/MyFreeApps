import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ScreenshotPreviewProps {
  file: File;
  /** The item below was filled in from this image. */
  wasRead: boolean;
  disabled: boolean;
  onRemove: () => void;
}

/** The screenshot as it will be (or was) read, so you can check it's the right one. */
export default function ScreenshotPreview({ file, wasRead, disabled, onRemove }: ScreenshotPreviewProps) {
  const img = useRef<HTMLImageElement>(null);
  // The URL is made and revoked by the same effect, so a re-run (StrictMode, a
  // new file) never leaves the picture pointing at a revoked URL.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (img.current) img.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const caption = wasRead ? "The item below was read from this screenshot." : "Check this is the right tooltip, then read it.";

  return (
    <figure className="space-y-2 rounded-lg border p-2">
      <img
        ref={img}
        alt={`Screenshot to read: ${file.name}`}
        className="mx-auto max-h-72 w-auto max-w-full rounded object-contain"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{caption}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border px-2 text-xs min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Use a different screenshot
        </button>
      </figcaption>
    </figure>
  );
}

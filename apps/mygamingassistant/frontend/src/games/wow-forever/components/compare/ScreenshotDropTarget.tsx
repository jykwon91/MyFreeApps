import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ClipboardPaste, ImagePlus } from "lucide-react";
import { cn } from "@platform/ui";

interface ScreenshotDropTargetProps {
  accept: string;
  disabled: boolean;
  onImage: (file: File) => void;
  onProblem: (message: string) => void;
}

const BUTTON = "inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[36px] hover:bg-muted/40 disabled:opacity-50";

function firstImage(files: FileList | readonly File[]): File | null {
  return Array.from(files).find((f) => f.type.startsWith("image/")) ?? null;
}

async function imageFromClipboardApi(): Promise<File | null> {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) {
      const blob = await item.getType(type);
      return new File([blob], "pasted-screenshot.png", { type });
    }
  }
  return null;
}

const canReadClipboard = typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function";

/**
 * Where a screenshot goes in. Three ways, all visible: the "Paste screenshot"
 * button, Ctrl+V while the box is focused (clicking the box focuses it — it
 * never opens a file dialog), or "Choose file" / drag and drop.
 */
export default function ScreenshotDropTarget({ accept, disabled, onImage, onProblem }: ScreenshotDropTargetProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(file: File | null, missing: string) {
    if (file) onImage(file);
    else onProblem(missing);
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    take(firstImage(e.clipboardData.files), "There's no image on your clipboard — take a screenshot first (Win+Shift+S), then paste.");
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) take(firstImage(e.dataTransfer.files), "That wasn't an image — drop a PNG, JPEG or WebP screenshot.");
  }

  async function pasteFromButton() {
    try {
      take(await imageFromClipboardApi(), "There's no image on your clipboard — take a screenshot first (Win+Shift+S), then paste.");
    } catch {
      onProblem("Your browser didn't let the page read the clipboard. Click the box and press Ctrl+V instead.");
    }
  }

  return (
    <div
      role="group"
      aria-label="Add a screenshot"
      tabIndex={disabled ? -1 : 0}
      onPaste={handlePaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-lg border-2 border-dashed p-4 text-center space-y-3 outline-none",
        "focus:border-blue-500 focus:bg-blue-500/5 focus:ring-2 focus:ring-blue-500/40",
        dragging && "border-blue-500 bg-blue-500/5",
      )}
    >
      <p className="text-sm font-medium">Paste a tooltip screenshot</p>
      <p className="text-xs text-muted-foreground">
        Screenshot the tooltip (Win+Shift+S), then press <strong>Paste screenshot</strong> — or click this box and
        press Ctrl+V. You can also drop an image here.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {canReadClipboard && (
          <button type="button" onClick={pasteFromButton} disabled={disabled} className={BUTTON}>
            <ClipboardPaste className="h-4 w-4" aria-hidden />
            Paste screenshot
          </button>
        )}
        <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} className={BUTTON}>
          <ImagePlus className="h-4 w-4" aria-hidden />
          Choose file
        </button>
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP up to 5 MB. Crop to the tooltip for the best result.</p>
      <input
        ref={fileInput}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(firstImage(e.target.files ?? []), "That wasn't an image — choose a PNG, JPEG or WebP screenshot.");
          e.target.value = "";
        }}
      />
    </div>
  );
}

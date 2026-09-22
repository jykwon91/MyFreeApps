import { useCallback, useState, type ClipboardEvent } from "react";
import { AlertBox, FileUploadDropzone, LoadingButton, TurnstileWidget } from "@platform/ui";
import { useExtractItemMutation } from "@/games/wow-forever/api/wowItemsApi";
import { isScreenshotReaderOffered, turnstileSiteKey } from "@/games/wow-forever/lib/itemReaderAvailability";
import { itemReaderErrorMessage } from "@/games/wow-forever/lib/itemReaderErrorMessage";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

interface ScreenshotReaderProps {
  onRead: (response: ItemExtractionResponse) => void;
}

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageFromClipboard(e: ClipboardEvent<HTMLDivElement>): File | null {
  const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
  return file ?? null;
}

/**
 * Read an item from a screenshot with AI. Open to everyone, but each read
 * spends API money, so the backend gates it with a Cloudflare Turnstile check,
 * a per-IP limit and a shared daily budget. When any of those says no, the
 * message points back to pasting text or typing the stats by hand.
 */
export default function ScreenshotReader({ onRead }: ScreenshotReaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  // Turnstile tokens are single-use: remounting the widget fetches a new one.
  const [widgetKey, setWidgetKey] = useState(0);
  const [extractItem, { isLoading }] = useExtractItemMutation();
  const needsToken = turnstileSiteKey() !== "";
  const handleVerify = useCallback((next: string) => setToken(next), []);
  const handleExpire = useCallback(() => setToken(""), []);

  if (!isScreenshotReaderOffered()) {
    return (
      <AlertBox variant="info">
        Reading screenshots isn't switched on for this site. Paste the tooltip text instead, or add the stats by hand.
      </AlertBox>
    );
  }

  function choose(next: File | null) {
    if (!next) return;
    if (next.size > MAX_IMAGE_BYTES) {
      setError("That image is over 5 MB — crop it to just the tooltip.");
      return;
    }
    setError(null);
    setFile(next);
  }

  async function read() {
    if (!file) return;
    setError(null);
    try {
      onRead(await extractItem({ image: file, turnstileToken: token || undefined }).unwrap());
      setFile(null);
    } catch (err) {
      setError(itemReaderErrorMessage(err));
    } finally {
      setToken("");
      setWidgetKey((k) => k + 1);
    }
  }

  const waitingForCheck = needsToken && !token;

  return (
    <div className="space-y-2" onPaste={(e) => choose(imageFromClipboard(e))}>
      <FileUploadDropzone
        onFilesSelected={(files) => choose(files[0] ?? null)}
        accept={ACCEPTED_TYPES}
        maxSizeBytes={MAX_IMAGE_BYTES}
        disabled={isLoading}
        label={file ? `Selected: ${file.name}` : "Drop a tooltip screenshot, click to browse, or paste (Ctrl+V)"}
        helperText="PNG, JPEG or WebP up to 5 MB. Crop to the tooltip for the best result."
      />
      {needsToken ? <TurnstileWidget key={widgetKey} onVerify={handleVerify} onExpire={handleExpire} /> : null}
      <LoadingButton
        isLoading={isLoading}
        loadingText="Reading screenshot..."
        disabled={!file || waitingForCheck}
        onClick={read}
        size="sm"
      >
        Read screenshot
      </LoadingButton>
      <p className="text-xs text-muted-foreground">
        {waitingForCheck ? "Complete the quick human check above to enable reading. " : null}
        Screenshot reading uses AI on a small shared daily budget. If it's busy or unavailable, paste the tooltip
        text or enter the stats by hand.
      </p>
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}
    </div>
  );
}

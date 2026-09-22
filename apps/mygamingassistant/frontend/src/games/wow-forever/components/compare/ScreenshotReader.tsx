import { useState, type ClipboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertBox, extractErrorMessage, FileUploadDropzone, LoadingButton, useIsAuthenticated } from "@platform/ui";
import { useExtractItemMutation } from "@/games/wow-forever/api/wowItemsApi";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";
import { isServeOnly } from "@/lib/serveOnly";

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
 * Read an item from a screenshot with AI. This spends API money, so it's
 * operator-only: hidden in the public (serve-only) site and behind sign-in
 * elsewhere. Pasting text works for everyone.
 */
export default function ScreenshotReader({ onRead }: ScreenshotReaderProps) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractItem, { isLoading }] = useExtractItemMutation();

  if (isServeOnly()) {
    return (
      <AlertBox variant="info">
        Reading screenshots isn't available on this site. Paste the tooltip text instead, or add the stats by hand.
      </AlertBox>
    );
  }
  if (!isAuthenticated) {
    return (
      <AlertBox variant="info">
        Reading screenshots uses AI and is limited to the site owner. Paste the tooltip text instead, or{" "}
        <Link to="/login" state={{ from: location.pathname }} className="underline">
          sign in
        </Link>
        .
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
      onRead(await extractItem({ image: file }).unwrap());
      setFile(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

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
      <LoadingButton isLoading={isLoading} loadingText="Reading screenshot..." disabled={!file} onClick={read} size="sm">
        Read screenshot
      </LoadingButton>
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}
    </div>
  );
}

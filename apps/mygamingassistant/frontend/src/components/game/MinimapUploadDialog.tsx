import { useState } from "react";
import { FileUploadDropzone, LoadingButton, showError, showSuccess } from "@platform/ui";
import {
  useGetMinimapUploadUrlMutation,
  useConfirmMinimapUploadMutation,
} from "@/store/gamesApi";
import { uploadFileToPresignedUrl } from "@/lib/storage";

export interface MinimapUploadDialogProps {
  mapId: string;
  mapName: string;
  onClose: () => void;
  onUploaded: () => void;
}

export default function MinimapUploadDialog({
  mapId,
  mapName,
  onClose,
  onUploaded,
}: MinimapUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [getUploadUrl] = useGetMinimapUploadUrlMutation();
  const [confirmUpload] = useConfirmMinimapUploadMutation();

  function handleFilesSelected(files: File[]) {
    const f = files[0] ?? null;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const { put_url, object_key } = await getUploadUrl(mapId).unwrap();
      await uploadFileToPresignedUrl(put_url, file, setProgress);
      await confirmUpload({ mapId, objectKey: object_key }).unwrap();
      showSuccess("Minimap updated.");
      onUploaded();
      onClose();
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err && err.data
          ? `Upload failed: ${JSON.stringify(err.data)}`
          : "Upload failed. Check the file is a PNG/JPG/WebP under 5 MB.";
      showError(message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Replace minimap for ${mapName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (uploading) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Replace minimap</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mapName} — PNG, JPG, or WebP up to 5 MB. Overwrites the current minimap.
          </p>
        </div>

        {!file ? (
          <FileUploadDropzone
            accept="image/png,image/jpeg,image/webp"
            maxSizeBytes={5 * 1024 * 1024}
            label="Drop minimap image here"
            helperText="Or click to browse"
            uploading={false}
            onFilesSelected={handleFilesSelected}
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-3 flex items-center gap-3">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Selected minimap preview"
                  className="h-20 w-20 rounded object-cover border"
                  draggable={false}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => handleFilesSelected([])}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                  aria-label="Remove selected file"
                >
                  Remove
                </button>
              )}
            </div>
            {uploading && (
              <div className="space-y-1" aria-live="polite">
                <div className="h-2 bg-muted/40 rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {progress < 100 ? `Uploading ${progress}%` : "Finalizing…"}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded-md border hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <LoadingButton
            isLoading={uploading}
            loadingText="Uploading…"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            Upload
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

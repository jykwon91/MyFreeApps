import { FileUploadDropzone } from "@platform/ui";

interface AimScreenshotPanelProps {
  preview: string | null;
  previewRef: React.RefObject<HTMLDivElement | null>;
  uploading: boolean;
  progress: number;
  uploaded: boolean;
  anchor: { x: number; y: number } | null;
  onFilesSelected: (files: File[]) => void;
  onPreviewClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onChange: () => void;
}

export default function AimScreenshotPanel({
  preview,
  previewRef,
  uploading,
  progress,
  uploaded,
  anchor,
  onFilesSelected,
  onPreviewClick,
  onChange,
}: AimScreenshotPanelProps) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">Aim screenshot *</p>
      {preview ? (
        <div
          ref={previewRef}
          onClick={onPreviewClick}
          className="relative rounded-md overflow-hidden border aspect-video bg-muted/20 cursor-crosshair"
          title="Click to set aim anchor point"
        >
          <img src={preview} alt="Aim preview" className="w-full h-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-xs text-white">
                {progress < 100 ? `${progress}%` : "Processing…"}
              </div>
            </div>
          )}
          {uploaded && !uploading && (
            <div className="absolute top-1.5 right-1.5 bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded">
              Uploaded
            </div>
          )}
          {anchor && (
            <div
              style={{
                position: "absolute",
                left: `calc(${anchor.x * 100}% - 6px)`,
                top: `calc(${anchor.y * 100}% - 6px)`,
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid rgba(239, 68, 68, 0.9)",
                background: "rgba(239, 68, 68, 0.3)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(); }}
            className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80"
          >
            Change
          </button>
        </div>
      ) : (
        <FileUploadDropzone
          accept="image/*"
          maxSizeBytes={10 * 1024 * 1024}
          label="Drop aim screenshot here"
          helperText="Then click to set aim anchor point"
          uploading={uploading}
          onFilesSelected={onFilesSelected}
        />
      )}
      {preview && !uploading && (
        <p className="text-xs text-muted-foreground mt-1">
          {anchor
            ? `Anchor set at ${Math.round(anchor.x * 100)}%, ${Math.round(anchor.y * 100)}%`
            : "Click the image to set the aim anchor point"}
        </p>
      )}
    </div>
  );
}

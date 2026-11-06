import { FileUploadDropzone } from "@platform/ui";

interface StandScreenshotPanelProps {
  preview: string | null;
  uploading: boolean;
  progress: number;
  uploaded: boolean;
  onFilesSelected: (files: File[]) => void;
  onChange: () => void;
}

export default function StandScreenshotPanel({
  preview,
  uploading,
  progress,
  uploaded,
  onFilesSelected,
  onChange,
}: StandScreenshotPanelProps) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">Stand screenshot *</p>
      {preview ? (
        <div className="relative rounded-md overflow-hidden border aspect-video bg-muted/20">
          <img src={preview} alt="Stand preview" className="w-full h-full object-cover" />
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
          <button
            type="button"
            onClick={onChange}
            className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80"
          >
            Change
          </button>
        </div>
      ) : (
        <FileUploadDropzone
          accept="image/*"
          maxSizeBytes={10 * 1024 * 1024}
          label="Drop stand screenshot here"
          helperText="Max 10 MB — PNG/JPG"
          uploading={uploading}
          onFilesSelected={onFilesSelected}
        />
      )}
    </div>
  );
}

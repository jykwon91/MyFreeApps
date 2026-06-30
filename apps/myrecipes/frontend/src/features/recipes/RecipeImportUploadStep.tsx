import { Button, FileUploadDropzone } from "@platform/ui";

interface Props {
  file: File | null;
  objectUrl: string | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  onExtract: () => void;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Step 1 of photo import: pick a photo (drag/drop, browse, or — on mobile —
 * the camera, offered natively by the file input), preview it, then trigger
 * extraction. When no file is selected we show the dropzone; once one is, we
 * show the preview + actions.
 */
export default function RecipeImportUploadStep({
  file,
  objectUrl,
  onSelect,
  onClear,
  onExtract,
}: Props) {
  if (!file) {
    return (
      <FileUploadDropzone
        accept={ACCEPT}
        maxSizeBytes={MAX_BYTES}
        label="Drop a recipe photo here, or click to browse"
        helperText="JPG, PNG, or WebP, max 15 MB"
        onFilesSelected={(files) => {
          if (files[0]) onSelect(files[0]);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={`Preview of ${file.name}`}
            className="max-h-48 max-w-xs rounded-md border object-contain"
          />
        ) : null}
        <p className="max-w-xs truncate text-sm text-muted-foreground">{file.name}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onExtract}>
          Extract recipe
        </Button>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Choose a different photo
        </button>
      </div>
    </div>
  );
}

import type { SourcePreviewType } from "@/shared/types/transaction/source-preview-type";

export interface SourcePreviewBodyProps {
  mode: SourcePreviewType;
  url: string;
  fileName: string | null;
}

export default function SourcePreviewBody({ mode, url, fileName }: SourcePreviewBodyProps) {
  switch (mode) {
    case "pdf":
      return <iframe src={url} className="w-full h-[70vh]" title="Source document" />;
    case "image":
      return <img src={url} alt="Source document" className="max-w-full max-h-[70vh] object-contain" />;
    case "other":
      return (
        <div className="p-4 text-sm text-muted-foreground">
          <a href={url} download={fileName} className="text-primary hover:underline">
            Download {fileName}
          </a>
        </div>
      );
  }
}

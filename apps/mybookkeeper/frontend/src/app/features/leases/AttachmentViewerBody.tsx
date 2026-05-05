import type { AttachmentViewMode } from "@/shared/types/lease/attachment-view-mode";
import AttachmentViewerImageBody from "./AttachmentViewerImageBody";
import AttachmentViewerOtherBody from "./AttachmentViewerOtherBody";
import AttachmentViewerPdfBody from "./AttachmentViewerPdfBody";

export interface AttachmentViewerBodyProps {
  mode: AttachmentViewMode;
  url: string;
  filename: string;
}

export default function AttachmentViewerBody({
  mode,
  url,
  filename,
}: AttachmentViewerBodyProps) {
  switch (mode) {
    case "pdf":
      return <AttachmentViewerPdfBody url={url} filename={filename} />;
    case "image":
      return <AttachmentViewerImageBody url={url} filename={filename} />;
    case "other":
      return <AttachmentViewerOtherBody url={url} filename={filename} />;
  }
}

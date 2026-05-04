import type { DocumentBlob } from "@/shared/services/documentService";
import SourceEmailLoading from "./SourceEmailLoading";
import SourceEmailUnavailable from "./SourceEmailUnavailable";

export interface SourceEmailFrameProps {
  blob: DocumentBlob | null;
}

export default function SourceEmailFrame({ blob }: SourceEmailFrameProps) {
  if (!blob) return <SourceEmailLoading />;
  // size === 0 is genuinely distinct from null — file existed but is empty
  if (blob.size === 0) return <SourceEmailUnavailable />;
  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <iframe src={blob.url} className="w-full h-[40vh]" title="Original email" />
    </div>
  );
}

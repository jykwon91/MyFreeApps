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
      {/* Force light color-scheme inside the iframe — forwarded emails ship
          plain text without their own background colors, and inheriting the
          parent's dark color-scheme renders dark text on a near-black
          background. Locking to light gives the email a white canvas. */}
      <iframe
        src={blob.url}
        className="w-full h-[40vh] bg-white"
        style={{ colorScheme: "light" }}
        title="Original email"
      />
    </div>
  );
}

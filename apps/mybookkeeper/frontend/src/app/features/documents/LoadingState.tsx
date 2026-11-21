import { LoadingRegion } from "@platform/ui";
import { Loader2 } from "lucide-react";

export default function LoadingState() {
  return (
    <LoadingRegion
      label="Loading document…"
      className="flex flex-col items-center justify-center h-full gap-3 text-foreground"
    >
      <Loader2 aria-hidden="true" size={32} className="animate-spin text-primary" />
      <p aria-hidden="true" className="text-sm">Loading document...</p>
    </LoadingRegion>
  );
}

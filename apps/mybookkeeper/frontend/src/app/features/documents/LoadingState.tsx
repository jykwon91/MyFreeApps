import { Loader2 } from "lucide-react";

export default function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm">Loading document...</p>
    </div>
  );
}

import { Loader2 } from "lucide-react";

export default function SourceEmailLoading() {
  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Loading source...
      </div>
    </div>
  );
}

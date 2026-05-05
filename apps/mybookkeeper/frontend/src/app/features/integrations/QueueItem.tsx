import { useCallback, useState } from "react";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";
import { STATUS_BADGE } from "@/shared/lib/constants";
import Badge from "@/shared/components/ui/Badge";
import Spinner from "@/shared/components/icons/Spinner";
import RetryIcon from "@/shared/components/icons/RetryIcon";
import { X } from "lucide-react";

export interface QueueItemProps {
  item: EmailQueueItem;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}

export default function QueueItem({ item, onRetry, onDismiss }: QueueItemProps) {
  const badge = STATUS_BADGE[item.status];
  const [busy, setBusy] = useState<"retry" | "dismiss" | null>(null);

  const handleRetry = useCallback(() => {
    setBusy("retry");
    onRetry(item.id);
  }, [onRetry, item.id]);

  const handleDismiss = useCallback(() => {
    setBusy("dismiss");
    onDismiss(item.id);
  }, [onDismiss, item.id]);

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">
          {item.attachment_filename ?? "Email body"}
        </p>
        {item.email_subject ? (
          <p className="truncate text-xs text-muted-foreground">
            {item.email_subject}
          </p>
        ) : null}
        {item.status === "failed" && item.error ? (
          <p className="text-xs text-red-600 mt-0.5 break-all">{item.error}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {item.status === "extracting" ? (
          <Spinner className="h-3.5 w-3.5 text-yellow-500" />
        ) : null}
        <Badge label={badge.label} color={badge.color} />
        {item.status === "failed" ? (
          <button
            onClick={handleRetry}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Retry"
          >
            {busy === "retry" ? <Spinner className="h-3.5 w-3.5" /> : <RetryIcon />}
          </button>
        ) : null}
        {item.status !== "done" ? (
          <button
            onClick={handleDismiss}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            title="Dismiss"
          >
            {busy === "dismiss" ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

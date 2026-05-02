import { FileText, Paperclip, Trash2 } from "lucide-react";
import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";

interface Props {
  attachment: ListingBlackoutAttachment;
  onDelete: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CalendarEventAttachmentCard({ attachment, onDelete }: Props) {
  const isImage = attachment.content_type.startsWith("image/");

  return (
    <li
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
      data-testid="attachment-card"
    >
      {isImage && attachment.presigned_url ? (
        <img
          src={attachment.presigned_url}
          alt={attachment.filename}
          className="h-10 w-10 rounded object-cover shrink-0"
          data-testid="attachment-image-preview"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
          {attachment.content_type === "application/pdf" ? (
            <FileText size={16} className="text-muted-foreground" />
          ) : (
            <Paperclip size={16} className="text-muted-foreground" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {attachment.presigned_url ? (
          <a
            href={attachment.presigned_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium truncate block hover:underline text-primary"
            data-testid="attachment-filename"
          >
            {attachment.filename}
          </a>
        ) : (
          <span className="text-sm font-medium truncate block" data-testid="attachment-filename">
            {attachment.filename}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatBytes(attachment.size_bytes)}
        </span>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive transition-colors"
        aria-label={`Remove ${attachment.filename}`}
        data-testid="attachment-delete-btn"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

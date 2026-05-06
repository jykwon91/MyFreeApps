import { AlertTriangle, FileText, Paperclip, Trash2 } from "lucide-react";
import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";
import { formatFileSize } from "@/shared/utils/file-size";

export interface CalendarEventAttachmentCardProps {
  attachment: ListingBlackoutAttachment;
  onDelete: () => void;
}

export default function CalendarEventAttachmentCard({ attachment, onDelete }: CalendarEventAttachmentCardProps) {
  const isImage = attachment.content_type.startsWith("image/");
  const isMissing = attachment.is_available === false;

  return (
    <li
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
      data-testid="attachment-card"
    >
      {isImage && !isMissing && attachment.presigned_url ? (
        <img
          src={attachment.presigned_url}
          alt={attachment.filename}
          className="h-10 w-10 rounded object-cover shrink-0"
          data-testid="attachment-image-preview"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
          {isMissing ? (
            <AlertTriangle size={16} className="text-destructive" aria-hidden="true" />
          ) : attachment.content_type === "application/pdf" ? (
            <FileText size={16} className="text-muted-foreground" />
          ) : (
            <Paperclip size={16} className="text-muted-foreground" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isMissing && attachment.presigned_url ? (
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
          <span
            className={`text-sm font-medium truncate block ${
              isMissing ? "text-destructive" : ""
            }`}
            data-testid="attachment-filename"
          >
            {attachment.filename}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {isMissing ? "File missing from storage." : formatFileSize(attachment.size_bytes)}
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

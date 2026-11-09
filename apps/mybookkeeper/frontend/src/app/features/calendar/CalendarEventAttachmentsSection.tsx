import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import {
  useDeleteBlackoutAttachmentMutation,
  useGetBlackoutAttachmentsQuery,
  useUploadBlackoutAttachmentMutation,
} from "@mybookkeeper/api-client/store/calendarApi";
import { BLACKOUT_ATTACHMENT_MAX_BYTES, BLACKOUT_ATTACHMENT_MIME_TYPES } from "@mybookkeeper/api-client/constants/blackoutAttachments";
import type { ListingBlackoutAttachment } from "@mybookkeeper/api-client/types/calendar/listing-blackout-attachment";
import { useCalendarAttachmentsMode } from "./useCalendarAttachmentsMode";
import CalendarAttachmentsListBody from "./CalendarAttachmentsListBody";

export interface CalendarEventAttachmentsSectionProps {
  blackoutId: string;
}

export default function CalendarEventAttachmentsSection({ blackoutId }: CalendarEventAttachmentsSectionProps) {
  const { data: attachments, isLoading } = useGetBlackoutAttachmentsQuery(blackoutId);
  const [uploadAttachment, { isLoading: isUploading }] =
    useUploadBlackoutAttachmentMutation();
  const [deleteAttachment] = useDeleteBlackoutAttachmentMutation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentsMode = useCalendarAttachmentsMode({ isLoading, attachments });

  function validateFile(file: File): string | null {
    if (file.size > BLACKOUT_ATTACHMENT_MAX_BYTES) return `${file.name} exceeds 25MB`;
    if (!BLACKOUT_ATTACHMENT_MIME_TYPES.includes(file.type) && file.type !== "") {
      return `${file.name}: unsupported file type`;
    }
    return null;
  }

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        showError(err);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        await uploadAttachment({ blackoutId, form }).unwrap();
        showSuccess(`${file.name} uploaded.`);
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status === 413) showError(`${file.name} exceeds the 25MB limit.`);
        else if (status === 415) showError(`${file.name}: unsupported file type.`);
        else showError(`Couldn't upload ${file.name}. Want to try again?`);
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void handleFiles(files);
  }

  async function handleDelete(attachment: ListingBlackoutAttachment) {
    try {
      await deleteAttachment({
        blackoutId,
        attachmentId: attachment.id,
      }).unwrap();
      showSuccess("Attachment removed.");
    } catch {
      showError("I couldn't remove that file. Want to try again?");
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Attachments</p>

      {/* Attachment list */}
      <CalendarAttachmentsListBody
        mode={attachmentsMode}
        attachments={attachments}
        onDelete={(att) => void handleDelete(att)}
      />

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
        data-testid="attachment-dropzone"
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Uploading…
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={16} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Drag & drop or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-primary font-medium hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground/70">
              PNG, JPEG, WebP, GIF, PDF, TXT · 25 MB max
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void handleFiles(files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

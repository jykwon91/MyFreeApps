import { Star } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { VideoCallNote } from "@/shared/types/applicant/video-call-note";

export interface VideoCallNoteCardProps {
  note: VideoCallNote;
}

const MAX_RATING = 5;

/**
 * Single video-call note card. Shows scheduled / completed timestamps,
 * gut_rating (1-5 stars), notes body. Read-only in PR 3.1b — editing UI
 * lands in PR 3.4 along with the kanban + create-note flow.
 */
export default function VideoCallNoteCard({ note }: VideoCallNoteCardProps) {
  const isComplete = note.completed_at !== null;
  const stars = note.gut_rating ?? 0;

  return (
    <article
      data-testid={`video-call-note-${note.id}`}
      className="border rounded-lg p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {isComplete ? "Completed" : "Scheduled"}
          </p>
          <p className="text-xs text-muted-foreground" title={formatAbsoluteTime(note.scheduled_at)}>
            Scheduled {formatRelativeTime(note.scheduled_at)}
          </p>
          {note.completed_at ? (
            <p className="text-xs text-muted-foreground" title={formatAbsoluteTime(note.completed_at)}>
              Completed {formatRelativeTime(note.completed_at)}
            </p>
          ) : null}
        </div>
        {note.gut_rating !== null ? (
          <div
            className="flex items-center gap-0.5"
            aria-label={`Gut rating ${stars} of ${MAX_RATING}`}
            data-testid={`video-call-note-rating-${note.id}`}
          >
            {Array.from({ length: MAX_RATING }, (_, i) => (
              <Star
                key={i}
                className={
                  i < stars
                    ? "h-4 w-4 fill-yellow-400 text-yellow-400"
                    : "h-4 w-4 text-muted-foreground/40"
                }
                aria-hidden="true"
              />
            ))}
          </div>
        ) : null}
      </div>
      {note.notes ? (
        <p className="text-sm whitespace-pre-wrap break-words">{note.notes}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">No notes recorded yet.</p>
      )}
    </article>
  );
}

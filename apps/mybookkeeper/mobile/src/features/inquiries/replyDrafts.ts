import { Directory, File, Paths } from "expo-file-system";
import { REPLY_DRAFT_DIRECTORY } from "../../constants/replies";
import { signedInEmail } from "../../lib/signedInEmail";
import type { ReplyDraft } from "../../types/ReplyDraft";

/** In the cache, not documents: a message to a tenant shouldn't go into the phone's backups. */
function draftsRoot(): Directory {
  return new Directory(Paths.cache, REPLY_DRAFT_DIRECTORY);
}

function draftFile(inquiryId: string): File {
  return new File(draftsRoot(), `${encodeURIComponent(inquiryId)}.json`);
}

export function hasReplyDraft(inquiryId: string): boolean {
  return loadReplyDraft(inquiryId) !== null;
}

export function loadReplyDraft(inquiryId: string): ReplyDraft | null {
  const file = draftFile(inquiryId);
  if (!file.exists) return null;
  try {
    const { owner, subject, body, templateId } = JSON.parse(file.textSync()) as Partial<ReplyDraft> & { owner?: string };
    // A session the server ended leaves its drafts for the same person to come back to.
    if (owner !== signedInEmail()) return null;
    if (typeof subject !== "string" || typeof body !== "string") return null;
    return { subject, body, templateId: typeof templateId === "string" ? templateId : null };
  } catch {
    // Unreadable means nothing to restore. It gets replaced at the next keystroke.
    return null;
  }
}

/** Called after a reply has gone, so failing here mustn't look like the send failed. */
export function deleteReplyDraft(inquiryId: string): void {
  try {
    const file = draftFile(inquiryId);
    if (file.exists) file.delete();
  } catch {
    // Nothing useful to tell anyone. The next save or sign-out replaces it.
  }
}

/** An empty draft isn't one. Failing to save mustn't get in the way of writing, so that's not reported. */
export function saveReplyDraft(inquiryId: string, draft: ReplyDraft): void {
  try {
    if (!draft.subject.trim() && !draft.body.trim()) {
      deleteReplyDraft(inquiryId);
      return;
    }
    // Signed out mid-edit: the drafts were just cleared, so this one mustn't come back.
    const owner = signedInEmail();
    if (!owner) return;
    draftsRoot().create({ idempotent: true, intermediates: true });
    const file = draftFile(inquiryId);
    if (!file.exists) file.create();
    file.write(JSON.stringify({ ...draft, owner }));
  } catch {
    // See above.
  }
}

export function clearReplyDrafts(): void {
  const root = draftsRoot();
  if (root.exists) root.delete();
}

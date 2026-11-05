import type { ReplyTemplateWriteOutcome } from "@mybookkeeper/api-client/types/inquiry/reply-template-write-outcome";
import type { ArchiveFailureFeedback } from "@/shared/types/inquiry/archive-failure-feedback";

export const REPLY_TEMPLATE_MESSAGES = {
  activeTab: "Active",
  archivedTab: "Archived",
  archivedIntro: "These are archived, so I don't offer them when you reply. Their names stay taken. Restore one to use it again.",
  archivedIntroViewer: "These are archived, so I don't offer them when you reply.",
  loadingArchived: "Loading your archived templates",
  noArchived: "No archived templates. When you archive one, it'll show up here so you can restore it.",
  noArchivedViewer: "No archived templates. When someone archives one, it'll show up here.",
  backToActive: "Back to active templates",
  couldntLoadArchived: "I couldn't load your archived templates. Want me to try again?",
  showingLastLoaded: "I couldn't reload your archived templates, so this is what I last loaded.",
  tryAgain: "Try again",
  tryingAgain: "Trying again…",
  archived: "Template archived.",
  alreadyGone: "That template was already archived or removed.",
  archiveViewOnly: "You have view-only access, so I can't archive templates.",
  archiveUnreachable: "I can't reach the server, so I couldn't archive that. Want to try again?",
  archiveFailed: "I couldn't archive that template. Want to try again?",
  restore: "Restore",
  restoring: "Restoring…",
  restored: "Restored. It's back in your templates.",
  restoreViewOnly: "You have view-only access, so I can't restore this.",
  restoreGone: "I can't find that template anymore.",
  restoreFailed: "I couldn't restore that. Want to try again?",
  restoreStillArchived: "I couldn't restore that, and it's still archived. Want to try again?",
  writeUnsure: "I'm not sure that went through. Check the list before trying again.",
} as const;

export const RESTORE_FAILURE_MESSAGES: Record<Exclude<ReplyTemplateWriteOutcome, "done">, string> = {
  gone: REPLY_TEMPLATE_MESSAGES.restoreGone,
  viewOnly: REPLY_TEMPLATE_MESSAGES.restoreViewOnly,
  unreachable: REPLY_TEMPLATE_MESSAGES.restoreStillArchived,
  stillListed: REPLY_TEMPLATE_MESSAGES.restoreStillArchived,
  unsure: REPLY_TEMPLATE_MESSAGES.writeUnsure,
  failed: REPLY_TEMPLATE_MESSAGES.restoreFailed,
};

/** The dialog stays open only where trying again could help. */
export const ARCHIVE_FAILURES: Record<Exclude<ReplyTemplateWriteOutcome, "done" | "gone">, ArchiveFailureFeedback> = {
  viewOnly: { message: REPLY_TEMPLATE_MESSAGES.archiveViewOnly, keepDialogOpen: false },
  unreachable: { message: REPLY_TEMPLATE_MESSAGES.archiveUnreachable, keepDialogOpen: true },
  stillListed: { message: REPLY_TEMPLATE_MESSAGES.archiveFailed, keepDialogOpen: true },
  unsure: { message: REPLY_TEMPLATE_MESSAGES.writeUnsure, keepDialogOpen: false },
  failed: { message: REPLY_TEMPLATE_MESSAGES.archiveFailed, keepDialogOpen: true },
};

export function restoreLabel(name: string): string {
  return `Restore ${name}`;
}

export function archiveDescription(name: string): string {
  return `"${name}" will stop showing up when you reply. You can restore it later from the Archived tab, but its name stays taken.`;
}

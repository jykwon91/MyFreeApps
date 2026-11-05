import type { ReplyTemplateRestoreOutcome } from "@mybookkeeper/api-client/types/inquiry/reply-template-restore-outcome";

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
  restore: "Restore",
  restoring: "Restoring…",
  restored: "Restored. It's back in your templates.",
  restoreViewOnly: "You have view-only access, so I can't restore this.",
  restoreGone: "I can't find that template anymore.",
  restoreFailed: "I couldn't restore that. Want to try again?",
  restoreStillArchived: "I couldn't restore that, and it's still archived. Want to try again?",
  restoreUnsure: "I'm not sure that went through. Check the list before trying again.",
} as const;

export const RESTORE_FAILURE_MESSAGES: Record<Exclude<ReplyTemplateRestoreOutcome, "restored">, string> = {
  gone: REPLY_TEMPLATE_MESSAGES.restoreGone,
  viewOnly: REPLY_TEMPLATE_MESSAGES.restoreViewOnly,
  stillArchived: REPLY_TEMPLATE_MESSAGES.restoreStillArchived,
  unsure: REPLY_TEMPLATE_MESSAGES.restoreUnsure,
  failed: REPLY_TEMPLATE_MESSAGES.restoreFailed,
};

export function restoreLabel(name: string): string {
  return `Restore ${name}`;
}

export function archiveDescription(name: string): string {
  return `"${name}" will stop showing up when you reply. You can restore it later from the Archived tab, but its name stays taken.`;
}

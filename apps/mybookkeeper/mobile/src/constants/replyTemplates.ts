import type { ReplyTemplateFailure } from "../types/ReplyTemplateFailure";
import type { ReplyTemplateField } from "../types/ReplyTemplateField";
import type { ReplyTemplateVariable } from "../types/ReplyTemplateVariable";

export const REPLY_TEMPLATE_NAME_MAX_LENGTH = 100;
export const REPLY_TEMPLATE_SUBJECT_MAX_LENGTH = 500;
export const REPLY_TEMPLATE_BODY_MAX_LENGTH = 10000;
/** The message box shows how much room is left from here. */
export const REPLY_TEMPLATE_BODY_COUNTER_FROM = 9000;
export const REPLY_TEMPLATE_BODY_MIN_HEIGHT = 220;

export const REPLY_TEMPLATE_FIELD_MAX_LENGTH: Record<ReplyTemplateField, number> = {
  subject: REPLY_TEMPLATE_SUBJECT_MAX_LENGTH,
  body: REPLY_TEMPLATE_BODY_MAX_LENGTH,
};

/** Anything that looks like a variable. Digits can't start one, so "$500" isn't. */
export const REPLY_TEMPLATE_VARIABLE_PATTERN = /\$[A-Za-z_]+/g;
/** A variable typed against these would run into them, so a space goes between. */
export const REPLY_TEMPLATE_SPACE_BEFORE = /[A-Za-z0-9$]/;
export const REPLY_TEMPLATE_SPACE_AFTER = /[A-Za-z0-9_]/;

/** Failures after which a new template may still have been saved. */
export const REPLY_TEMPLATE_AMBIGUOUS_CREATE: ReadonlySet<ReplyTemplateFailure> = new Set(["noResponse", "nameTaken", "serverError"]);

export const REPLY_TEMPLATE_SKELETON_ROWS = ["a", "b", "c", "d"];

// Mirrors the backend's reply_template_renderer. test_reply_template_variables_match_phone.py holds the tokens to it.
export const REPLY_TEMPLATE_VARIABLES: readonly ReplyTemplateVariable[] = [
  { token: "$name", fillsIn: "The person's name, or \"there\" if I don't know it" },
  { token: "$listing", fillsIn: "The listing title, or \"the room\"" },
  { token: "$dates", fillsIn: "The dates they asked for, or \"your requested dates\" if they haven't said" },
  { token: "$start_date", fillsIn: "The start date they asked for, or \"the start date you requested\"" },
  { token: "$end_date", fillsIn: "The end date they asked for, or \"the end date you requested\"" },
  { token: "$employer", fillsIn: "Their employer, or nothing if I don't know it" },
  { token: "$host_name", fillsIn: "Your name, or the first part of your email if you haven't set one" },
  { token: "$host_phone", fillsIn: "I leave this blank for now." },
];

export const REPLY_TEMPLATE_MESSAGES = {
  loadingList: "Loading your reply templates",
  loadingOne: "Loading this template",
  couldntLoadList: "I couldn't load your templates.",
  couldntLoadOne: "I couldn't load this template.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  cantFind: "I can't find that template.",
  maybeArchived: "It may have been archived.",
  back: "Back",
  noneHeading: "You don't have any reply templates.",
  noneBody: "Want to make one? I'll fill in names, dates and listings when you reply.",
  noneBodyViewer: "You have view-only access, so I can't make one for you here.",
  newTemplate: "New template",
  makeOne: "Make a template",
  edit: "Edit",
  nameLabel: "Name",
  nameHint: "What you'll see when you pick it, like Polite decline.",
  nameRequired: "Give it a name.",
  nameClash: "You already have a template with that name.",
  nameTaken: "That name is taken. It might be a template you archived. Restore it from Archived templates, or try another name.",
  subjectRequired: "Add a subject.",
  messageRequired: "Write the message.",
  variablesHelp: "What the variables fill in",
  addToMessage: "Add to message",
  addToSubject: "Add to subject",
  tooLong: "That would make it too long.",
  saveTemplate: "Save template",
  saveChanges: "Save changes",
  saving: "Saving…",
  templateSaved: "Template saved.",
  changesSaved: "Changes saved.",
  couldntReach: "I can't reach the server, so I couldn't save that. Your template is still here.",
  saveViewOnly: "You have view-only access, so I can't save this.",
  saveFailed: "I couldn't save that. Want to try again?",
  saveUnsure: "I'm not sure that saved. Check your templates before trying again, so you don't end up with two.",
  goneAnymore: "I can't find that template anymore.",
  discardTitle: "Discard your changes?",
  discardBody: "I haven't saved them yet.",
  keepEditing: "Keep editing",
  discard: "Discard",
  viewOnlyHeading: "You have view-only access.",
  viewOnlyBody: "Ask the workspace owner to change your access.",
  archive: "Archive",
  archiving: "Archiving…",
  archiveBody: "It will stop showing up when you reply. You can restore it later from Archived templates, but its name stays taken.",
  archived: "Archived.",
  archiveViewOnly: "You have view-only access.",
  archiveUnreachable: "I can't reach the server, so I couldn't archive that.",
  archiveUnsure: "I'm not sure that went through. Pull down on the list to check.",
  archiveFailed: "I couldn't archive that. Want to try again?",
  templatesLoadFailed: "I couldn't load your templates.",
  subject: "Subject",
  message: "Message",
  variablesHeading: "Variables in this template",
  archivedLink: "Archived templates",
  archivedLinkHint: "Shows the templates you've archived",
  loadingArchived: "Loading your archived templates",
  archivedHeader: "These are archived, so I don't offer them when you reply. Their names stay taken. Restore one to use it again.",
  archivedHeaderViewer: "These are archived, so I don't offer them when you reply.",
  noArchivedHeading: "No archived templates.",
  noArchivedBody: "When you archive one, it'll show up here so you can restore it.",
  noArchivedBodyViewer: "When someone archives one, it'll show up here.",
  couldntLoadArchived: "I couldn't load your archived templates.",
  archivedNote: "Archived. I won't offer this one when you reply.",
  cantFindArchived: "I can't find that archived template.",
  maybeRestored: "It may have been restored.",
  restore: "Restore",
  restoring: "Restoring…",
  restored: "Restored. It's back in your templates.",
  restoreViewOnly: "You have view-only access, so I can't restore this.",
  restoreStillArchived: "I couldn't restore that, and it's still archived. Want to try again?",
  restoreUnsure: "I'm not sure that went through. Pull down to check.",
  restoreFailed: "I couldn't restore that. Want to try again?",
} as const;

export function archiveTemplateTitle(name: string): string {
  return `Archive "${name}"?`;
}

export function messageCounter(length: number): string {
  return `${length.toLocaleString("en-US")} of ${REPLY_TEMPLATE_BODY_MAX_LENGTH.toLocaleString("en-US")}`;
}

export function unknownVariablesHint(tokens: readonly string[]): string {
  if (tokens.length === 1) return `I don't recognize ${tokens[0]}, so I'll leave it as you typed it.`;
  return `I don't recognize ${tokens.join(", ")}, so I'll leave them as you typed them.`;
}

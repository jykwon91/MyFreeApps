import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { ReplyTemplateUpdateRequest } from "@mybookkeeper/api-client/types/inquiry/reply-template-update-request";
import {
  REPLY_TEMPLATE_MESSAGES,
  REPLY_TEMPLATE_SPACE_AFTER,
  REPLY_TEMPLATE_SPACE_BEFORE,
  REPLY_TEMPLATE_VARIABLE_PATTERN,
  REPLY_TEMPLATE_VARIABLES,
} from "../../constants/replyTemplates";
import type { ReplyTemplateFormValues } from "../../types/ReplyTemplateFormValues";
import type { ReplyTemplateInsertion } from "../../types/ReplyTemplateInsertion";
import type { TextSelection } from "../../types/TextSelection";

export function toFormValues(original: ReplyTemplate | null): ReplyTemplateFormValues {
  return {
    name: original?.name ?? "",
    subject: original?.subject_template ?? "",
    body: original?.body_template ?? "",
  };
}

/** What gets sent: a subject is one line, and nobody means the spaces round the edges. */
export function normalise(values: ReplyTemplateFormValues): ReplyTemplateFormValues {
  return {
    name: values.name.trim(),
    subject: values.subject.replace(/\s*[\r\n]+\s*/g, " ").trim(),
    body: values.body.trim(),
  };
}

/** Compared tidied on both sides: a template saved with a trailing newline isn't a change. */
export function changedFields(values: ReplyTemplateFormValues, original: ReplyTemplate): ReplyTemplateUpdateRequest {
  const now = normalise(values);
  const was = normalise(toFormValues(original));
  const changes: ReplyTemplateUpdateRequest = {};
  if (now.name !== was.name) changes.name = now.name;
  if (now.subject !== was.subject) changes.subject_template = now.subject;
  if (now.body !== was.body) changes.body_template = now.body;
  return changes;
}

export function hasAnyText(values: ReplyTemplateFormValues): boolean {
  return values.name !== "" || values.subject !== "" || values.body !== "";
}

/** Case matters, as it does to the server. */
export function nameClash(name: string, templates: readonly ReplyTemplate[], ownId: string | null): boolean {
  return templates.some((template) => template.id !== ownId && template.name === name);
}

/**
 * Words that look like a variable but aren't one. The server fills in a known variable even
 * when letters follow it, so those are left alone: they aren't left as typed.
 */
export function unknownVariables(...texts: string[]): string[] {
  const known = REPLY_TEMPLATE_VARIABLES.map(({ token }) => token);
  const found = texts.flatMap((text) => text.match(REPLY_TEMPLATE_VARIABLE_PATTERN) ?? []);
  const unknown = found.filter((word) => !known.some((token) => word.startsWith(token)));
  return [...new Set(unknown)];
}

/**
 * Puts a variable at the cursor, in place of anything selected. The server swaps variables
 * with a plain replace, so "$names" would come out as "Danas": spaces keep it apart from letters.
 * Returns null when the result wouldn't fit.
 */
export function insertAtCursor(text: string, selection: TextSelection, token: string, max: number): ReplyTemplateInsertion | null {
  const before = text.slice(0, Math.min(selection.start, selection.end));
  const after = text.slice(Math.max(selection.start, selection.end));
  const lead = REPLY_TEMPLATE_SPACE_BEFORE.test(before.slice(-1)) ? " " : "";
  const trail = REPLY_TEMPLATE_SPACE_AFTER.test(after.slice(0, 1)) ? " " : "";
  const inserted = `${lead}${token}${trail}`;
  const result = `${before}${inserted}${after}`;
  if (result.length > max) return null;
  return { text: result, cursor: before.length + inserted.length };
}

/** What's wrong with the (normalised) values, for the fields that have a problem. */
export function formProblems(
  values: ReplyTemplateFormValues,
  templates: readonly ReplyTemplate[] | undefined,
  ownId: string | null,
): Partial<Record<keyof ReplyTemplateFormValues, string>> {
  const problems: Partial<Record<keyof ReplyTemplateFormValues, string>> = {};
  if (!values.name) problems.name = REPLY_TEMPLATE_MESSAGES.nameRequired;
  else if (templates && nameClash(values.name, templates, ownId)) problems.name = REPLY_TEMPLATE_MESSAGES.nameClash;
  if (!values.subject) problems.subject = REPLY_TEMPLATE_MESSAGES.subjectRequired;
  if (!values.body) problems.body = REPLY_TEMPLATE_MESSAGES.messageRequired;
  return problems;
}

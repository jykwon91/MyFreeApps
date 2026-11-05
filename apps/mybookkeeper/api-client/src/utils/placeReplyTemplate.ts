import type { ReplyTemplate } from "../types/inquiry/reply-template";

function sortsBefore(a: ReplyTemplate, b: ReplyTemplate): boolean {
  if (a.display_order !== b.display_order) return a.display_order < b.display_order;
  return a.name.localeCompare(b.name) < 0;
}

/**
 * The list with this template where it belongs: kept in its spot when it's already
 * there, put in the server's order (display order, then name) when it's new, and
 * taken out when it doesn't belong in this list.
 */
export function placeReplyTemplate(
  templates: ReplyTemplate[],
  template: ReplyTemplate,
  belongsHere: boolean,
): ReplyTemplate[] {
  const others = templates.filter((t) => t.id !== template.id);
  if (!belongsHere) return others;
  if (others.length < templates.length) {
    return templates.map((t) => (t.id === template.id ? template : t));
  }
  const at = others.findIndex((t) => sortsBefore(template, t));
  return at === -1 ? [...others, template] : [...others.slice(0, at), template, ...others.slice(at)];
}

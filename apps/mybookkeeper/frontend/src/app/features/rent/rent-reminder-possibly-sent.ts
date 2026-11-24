import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";

/** How the card's possibly-sent copy names the tenant. */
export const TENANT_WORDS = "the tenant";

/** Which reminder and which tries a "may already have reached them" confirmation was given for. */
export function possiblySentKey(preview: RentReminderPreview): string {
  const tries = preview.possibly_sent.map((p) => `${p.channel}:${p.attempt}`).join(",");
  return `${preview.due_date}|${tries}`;
}

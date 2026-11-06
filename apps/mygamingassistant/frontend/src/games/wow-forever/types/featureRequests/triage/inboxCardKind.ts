import type { INBOX_CARD_KIND } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";

/** See `INBOX_CARD_KIND`. */
export type InboxCardKind = (typeof INBOX_CARD_KIND)[keyof typeof INBOX_CARD_KIND];

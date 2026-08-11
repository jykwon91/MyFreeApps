/**
 * How much of an upgrade an offer is, at a glance.
 *
 * `conditional` is the one that matters: a bill-credit plan can post the
 * largest saving on the board while only holding it inside a narrow usage band.
 * It is an upgrade the way a cursed item is an upgrade — the headline number is
 * real, and it is not the whole story.
 */
export type OfferVerdict = "major" | "solid" | "slight" | "conditional";

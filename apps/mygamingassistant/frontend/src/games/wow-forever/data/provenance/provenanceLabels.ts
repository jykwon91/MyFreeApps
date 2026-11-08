import { PROVENANCE, type Provenance } from "@/games/wow-forever/types/provenance/provenance";

/** The badge's words. Short, so a badge never wraps on a phone. */
export const PROVENANCE_LABEL: Readonly<Record<Provenance, string>> = {
  seen: "Seen in game",
  published: "Official",
  client: "Game files",
  classic: "Classic data",
  unconfirmed: "Unconfirmed",
};

/** What each badge means: its tap / hover explanation and the "How to read these tags" list. */
export const PROVENANCE_DESCRIPTION: Readonly<Record<Provenance, string>> = {
  seen: "We saw this ourselves in WoW Forever on the date shown.",
  published: "The WoW Forever team said this in patch notes or an official post.",
  client:
    "Read from WoW Forever's own game files. It's what the game ships with, but Blizzard can still change it on their servers.",
  classic: "True in Classic WoW. Forever often matches, but it may differ.",
  unconfirmed: "Nobody has checked this in Forever yet. Treat it as a best guess.",
};

/** Most trusted first: the order the "How to read these tags" list uses. */
export const PROVENANCE_ORDER: readonly Provenance[] = [
  PROVENANCE.seen,
  PROVENANCE.published,
  PROVENANCE.client,
  PROVENANCE.classic,
  PROVENANCE.unconfirmed,
];

/** The extra lines a badge can carry, so the same reason always reads the same. */
export const PROVENANCE_DETAIL = {
  betaReport: "Players reported this in the beta. It hasn't been checked since launch.",
  classicRoute: "This is the Classic route or spot.",
  classicRule: "This is the Classic rule.",
  loginHelp: "Written by us from common player reports; not from Blizzard.",
} as const;

/** The "How to read these tags" note in every WoW Forever page's footer. */
export const PROVENANCE_GUIDE = {
  title: "How to read these tags",
  intro: "Facts on these pages carry a tag that says where they come from. Tap, hover or focus a tag to read what it means.",
  untagged: "In a list that tags its rows, a row with no tag has been checked against WoW Forever.",
} as const;

/**
 * Read after a badge's label by screen readers: the badge opens an explanation.
 * Visually hidden text, not an aria-label, so the badge never answers a form
 * field's label query ("Classic data" contains "Class").
 */
export const PROVENANCE_BADGE_HINT = ": what this means";

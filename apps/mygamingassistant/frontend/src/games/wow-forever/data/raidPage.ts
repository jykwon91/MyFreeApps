/**
 * The raid web page's fixed values (`/wow-forever/raids/:webId`, `pages/WowRaidPage.tsx`).
 *
 * The string values are the API's (`backend/app/schemas/wow/raid_web.py`); `types/raid.ts` derives its unions
 * from them.
 */
import type { RaidState } from "@/games/wow-forever/types/raid";

export const RAID_STATE = {
  OPEN: "open",
  CLOSED: "closed",
  STARTED: "started",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const SEGMENT_KIND = { TEXT: "text", MENTION: "mention", TIME: "time" } as const;

/** Discord's timestamp styles (`<t:unix:style>`). */
export const TIME_STYLE = {
  SHORT_TIME: "t",
  LONG_TIME: "T",
  SHORT_DATE: "d",
  LONG_DATE: "D",
  SHORT_DATE_TIME: "f",
  LONG_DATE_TIME: "F",
  RELATIVE: "R",
} as const;

export const DISPLAY_ROLE = { TANK: "tank", HEALER: "healer", MELEE: "melee", RANGED: "ranged" } as const;

export const LIST_STATUS = { TENTATIVE: "tentative", BENCH: "bench", ABSENCE: "absence" } as const;

/** Why the page shows no raid: it isn't there (404, or a mistyped link's 422), or it couldn't be read. */
export const RAID_PROBLEM = { NOT_FOUND: "not_found", LOAD_FAILED: "load_failed" } as const;

/** The state chip's text — the state is never told by colour alone. */
export const RAID_STATE_LABEL: Readonly<Record<RaidState, string>> = {
  [RAID_STATE.OPEN]: "Open",
  [RAID_STATE.CLOSED]: "Sign-ups closed",
  [RAID_STATE.STARTED]: "Started",
  [RAID_STATE.COMPLETED]: "Completed",
  [RAID_STATE.CANCELLED]: "Cancelled",
};

/** The state chip's dot. */
export const RAID_STATE_DOT: Readonly<Record<RaidState, string>> = {
  [RAID_STATE.OPEN]: "bg-emerald-500",
  [RAID_STATE.CLOSED]: "bg-amber-500",
  [RAID_STATE.STARTED]: "bg-sky-500",
  [RAID_STATE.COMPLETED]: "bg-slate-400",
  [RAID_STATE.CANCELLED]: "bg-red-500",
};

/** The bot's own icons — the art its Discord post uses — served by the API (`app/api/discord_raid_icons.py`). */
export const RAID_ICON_BASE = "/api/discord/raid-icons";

export const RAID_ICON = {
  DATE: "info_date",
  LOCK: "info_lock",
  SIGNUPS: "info_signups",
  LATE: "status_late",
} as const;

/** Re-read the raid every minute while its tab is in view; a hidden tab doesn't poll. */
export const RAID_POLLING = { pollingInterval: 60_000, skipPollingIfUnfocused: true } as const;

/** How often "in 3 days" and "Updated 20 seconds ago" re-read the clock. */
export const RAID_CLOCK_TICK_MS = 10_000;

/** The loading skeleton: the header, then this many column cards of this many rows. */
export const RAID_SKELETON = { CARDS: 4, ROWS: 5 } as const;

export const SITE_NAME = "MyGamingAssistant";
export const WOW_FOREVER_HOME = "/wow-forever";
/** The groups' place on the page: the Discord [Groups] reply links to it (`raid_groups_views.GROUPS_ANCHOR`). */
export const RAID_GROUPS_ANCHOR = "groups";

/** 16 px gutters on a phone. */
export const RAID_MAIN_CLASS = "p-4 sm:p-8 space-y-6 max-w-5xl";
export const RAID_SECTION_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-muted-foreground";
export const RAID_FOCUS_RING_CLASS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";
/** A bordered control: [Open in Discord], [Refresh], the not-found panel's way back. */
export const RAID_BUTTON_CLASS = [
  "inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground",
  "hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60",
  RAID_FOCUS_RING_CLASS,
].join(" ");

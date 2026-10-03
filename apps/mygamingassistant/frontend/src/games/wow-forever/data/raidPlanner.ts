/**
 * The group planner's fixed values (`/wow-forever/raids/:webId/plan`, `pages/WowRaidPlannerPage.tsx`).
 *
 * The refusals are the API's (`backend/app/api/raid_web.py`); the sizes are the backend's
 * (`models/wow/wow_raid_signup.py`).
 */
import { RAID_FOCUS_RING_CLASS } from "@/games/wow-forever/data/raidPage";

/** The seats in a group. */
export const GROUP_SIZE = 5;

/** The droppable "Not in a group"; a seat's is `slot:<group>:<slot>` (`lib/raidGroups.ts`). */
export const POOL_ID = "pool";

/** The link's token: 32 random bytes, base64url without padding (`raid_plan_links.mint`). */
export const PLANNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** The fragment key the token arrives under: `/plan#k=<token>`. */
export const PLANNER_TOKEN_HASH_KEY = "k";
/** Where this tab keeps a raid's token, once it has left the address bar. */
export const PLANNER_TOKEN_STORAGE_PREFIX = "mga.raidPlanner.";
/** Planner requests' `Authorization` scheme — never `Bearer`, which the shared client owns. */
export const PLANNER_AUTH_SCHEME = "RaidPlanner";

export const PLAN_REFUSAL = {
  GROUPS_CHANGED: "groups_changed",
  RAID_OVER: "raid_over",
  INVALID_PLAN: "invalid_plan",
} as const;

/** Under this long until the link stops working, its countdown turns amber. */
export const LINK_WARNING_MS = 10 * 60_000;
/** How often the countdown re-reads the clock. */
export const PLANNER_CLOCK_TICK_MS = 10_000;

/** A press must move 4 px before it drags, so a click stays a click. */
export const MOUSE_ACTIVATION = { distance: 4 } as const;
/** A touch must rest 200 ms before it drags, so a swipe still scrolls the page. */
export const TOUCH_ACTIVATION = { delay: 200, tolerance: 6 } as const;

/** The loading skeleton: "Not in a group" and this many groups, of five rows each. */
export const PLANNER_SKELETON_GROUPS = 3;

/** Wider than the raid page's: up to four columns of groups beside "Not in a group". 16 px gutters on a phone. */
export const PLANNER_MAIN_CLASS = "p-4 sm:p-8 space-y-5 max-w-[96rem]";
/** "Not in a group" beside the groups from 768 px; above them on a phone. */
export const PLANNER_LAYOUT_CLASS = "grid items-start gap-3 md:grid-cols-[18rem_minmax(0,1fr)]";
/** The groups, by the width of their own box (a container query): one column, then 2, 3 and 4. */
export const PLANNER_GROUPS_CLASS =
  "grid grid-cols-1 items-start gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4";
/** A row in "Not in a group" or a group: one height, so the two line up side by side. */
export const PLANNER_ROW_CLASS = "flex min-h-[52px] items-center gap-2 px-2 py-1";
/** The theme's hover tint (its colour tokens are plain classes, which take no `hover:`). */
export const PLANNER_HOVER_CLASS = "hover:bg-black/5 dark:hover:bg-white/10";
/** A 44 × 44 icon button beside a player: their note, Move to. */
export const PLANNER_ICON_BUTTON_CLASS = [
  "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground",
  PLANNER_HOVER_CLASS,
  RAID_FOCUS_RING_CLASS,
].join(" ");

export const PLANNER_MESSAGE = {
  SAVED: "Groups saved",
  CHANGED: "Someone else saved the groups — showing their version.",
  ROSTER_CHANGED: "The sign-ups changed while you planned — showing the groups as they are now.",
  SAVE_FAILED: "The groups couldn't be saved right now. Try again in a moment.",
  RELOAD_FAILED: "The groups couldn't be reloaded right now. Try again in a moment.",
  COPIED: "Copied",
  COPY_BLOCKED: "Your browser blocked copying. Select the text below and copy it yourself:",
  LINK_PROBLEM:
    "This planner link is missing or expired. On the raid post, open Apps → Raid: Edit (right-click or " +
    "long-press) and press [Groups].",
  NOBODY_SEATED: "Nobody has a seat yet.",
  EVERYONE_PLACED: "Everyone with a seat is in a group.",
  PUBLISH_HINT: "Shows the groups on the web page and a [Groups] button on the raid post.",
  UNSAVED: "Unsaved changes",
  CANCELLED: "This raid was cancelled — its groups can't be changed.",
  OVER: "This raid is over — its groups can't be changed.",
} as const;

/**
 * The raid web page's read shape — `GET /wow/raids/{web_id}` (`backend/app/schemas/wow/raid_web.py`), snake_case
 * like the rest of the MGA API. It never carries a Discord id, a sign-up note or the leader's image link.
 */
import type {
  DISPLAY_ROLE,
  LIST_STATUS,
  RAID_PROBLEM,
  RAID_STATE,
  SEGMENT_KIND,
  TIME_STYLE,
} from "@/games/wow-forever/data/raidPage";

type ValueOf<T> = T[keyof T];

export type RaidState = ValueOf<typeof RAID_STATE>;
export type TimeStyle = ValueOf<typeof TIME_STYLE>;
export type DisplayRole = ValueOf<typeof DISPLAY_ROLE>;
export type ListStatus = ValueOf<typeof LIST_STATUS>;
export type RaidProblemKind = ValueOf<typeof RAID_PROBLEM>;

/** Description text, shown as typed. */
export interface TextSegment {
  kind: typeof SEGMENT_KIND.TEXT;
  text: string;
}

/** A mention without its id: "@member", "@role" or "#channel". */
export interface MentionSegment {
  kind: typeof SEGMENT_KIND.MENTION;
  text: string;
}

/** A Discord timestamp (`<t:unix:style>`), shown in the viewer's zone. */
export interface TimeSegment {
  kind: typeof SEGMENT_KIND.TIME;
  unix: number;
  style: TimeStyle;
}

export type Segment = TextSegment | MentionSegment | TimeSegment;

/** One role on the role row: its seat holders, or its players in line against a limit. */
export interface RaidRoleCount {
  role: DisplayRole;
  label: string;
  icon: string;
  count: number;
  limit: number | null;
}

/** A player on the page, in a column or a list. */
export interface RaidEntry {
  /** The sign-up's id, so rows keep their place across refreshes. */
  id: string;
  /** The order number in line; null off the line. */
  number: number | null;
  name: string;
  wow_class: string | null;
  /** "Fury Warrior". */
  spec: string | null;
  /** The spec's icon, else the class's. */
  icon: string | null;
  role_group: DisplayRole | null;
  late: boolean;
  queued: boolean;
}

/** A column with anyone in it: Tanks, a class, or "No class yet"; its players in line order. */
export interface RaidColumn {
  key: string;
  label: string;
  icon: string | null;
  count: number;
  limit: number | null;
  entries: RaidEntry[];
}

/** Tentative, Bench or Absence, when anyone is on it. */
export interface RaidStatusList {
  status: ListStatus;
  label: string;
  icon: string;
  entries: RaidEntry[];
}

/** A posted raid, as its web page shows it. */
export interface RaidPage {
  web_id: string;
  title: string;
  raid_key: string;
  raid_name: string;
  leader_name: string | null;
  /** ISO 8601. */
  starts_at: string;
  /** When the deadline will close sign-ups, while they're open. */
  closes_at: string | null;
  state: RaidState;
  cancel_reason: string | null;
  size_cap: number;
  /** Confirmed + late, as on the post. */
  seats_taken: number;
  late: number;
  queued: number;
  /** "#rrggbb", the post's: the leader's pick while sign-ups are open, grey after. */
  color: string;
  /** The raid's built-in art on this site; never the leader's own link. */
  banner_url: string | null;
  /** The post in Discord, while there is one. */
  discord_url: string | null;
  description: Segment[];
  roles: RaidRoleCount[];
  columns: RaidColumn[];
  lists: RaidStatusList[];
  /** The `?v=` of the icon URLs. */
  icons_version: string;
}

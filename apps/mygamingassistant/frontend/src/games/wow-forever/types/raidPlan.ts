/**
 * The group planner's shapes — `GET` / `PUT /wow/raids/{web_id}/plan` (`backend/app/schemas/wow/raid_plan.py`),
 * snake_case like the rest of the MGA API. A plan carries the players' notes while the raid takes them, so only the
 * leader's planner link reads it.
 */
import type { DisplayRole, RaidState } from "@/games/wow-forever/types/raid";

/** A seated player, as the post shows them, and their place in the groups. */
export interface PlanPlayer {
  /** The sign-up's id: a save names players by it. */
  id: string;
  name: string;
  wow_class: string | null;
  /** "Fury Warrior". */
  spec: string | null;
  /** The spec's icon, else the class's. */
  icon: string | null;
  role_group: DisplayRole | null;
  /** The order number in line. */
  number: number | null;
  late: boolean;
  /** Only while the raid takes notes. */
  note: string | null;
  /** 1–8, with `slot`; null outside a group. */
  group: number | null;
  /** 1–5. */
  slot: number | null;
}

/** A raid's groups, as its planner shows them. */
export interface RaidPlan {
  web_id: string;
  title: string;
  /** ISO 8601. */
  starts_at: string;
  /** Cancelled or completed: the planner is read-only. */
  state: RaidState;
  size_cap: number;
  /** The groups of five that hold the raid, at most eight. */
  group_count: number;
  /** A save sends it back; someone else's save in between refuses it. */
  version: number;
  /** Raiders see the groups: on the raid's web page, and [Groups] on its post. */
  published: boolean;
  /** ISO 8601: the last save. */
  updated_at: string | null;
  /** ISO 8601: when this planner link stops working. */
  link_expires_at: string;
  notes_enabled: boolean;
  /** The `?v=` of the icon URLs. */
  icons_version: string;
  /** In line order. */
  players: PlanPlayer[];
}

/** One placed player in a save. */
export interface PlanAssignment {
  signup_id: string;
  group: number;
  slot: number;
}

/** A save: the version it was planned on, whether raiders see the groups, and every placed player. */
export interface RaidPlanSave {
  version: number;
  published: boolean;
  assignments: PlanAssignment[];
}

/** The groups as saved, and who was left out for having lost their seat meanwhile. */
export interface RaidPlanSaved {
  plan: RaidPlan;
  dropped: string[];
}

/** A seat in a group. */
export interface SlotRef {
  group: number;
  slot: number;
}

/** Who sits where: a placed player's id → their seat. Anyone missing is in no group. */
export type Placements = Readonly<Record<string, SlotRef>>;

/** What a planner request needs: the raid, and the leader's link token. */
export interface PlannerArgs {
  webId: string;
  token: string;
}

/** A re-read of the plan: the groups as they are now, or why they couldn't be read. */
export type PlanReload = { plan: RaidPlan } | { error: unknown };

/** What the planner's grid shows, and how a move is made. */
export interface PlannerBoard {
  plan: RaidPlan;
  placements: Placements;
  /** Cancelled or over: nobody moves. */
  readOnly: boolean;
  /** A save is under way: nothing moves until it lands, so the saved groups never undo a move. */
  locked: boolean;
  /** Into `seat` — swapping with whoever sits there — or, with null, out of the groups. */
  onPlace: (playerId: string, seat: SlotRef | null) => void;
}

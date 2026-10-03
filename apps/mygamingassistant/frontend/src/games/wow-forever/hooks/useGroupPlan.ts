/**
 * The planner's state: the plan as last read or saved, and the leader's changes to it — who sits where, and whether
 * raiders see the groups. Every move goes through `lib/raidGroups.ts`; nothing is sent until Save.
 */
import { useMemo, useReducer } from "react";
import { autoFill, placementsOf, samePlacements, swapOrPlace } from "@/games/wow-forever/lib/raidGroups";
import type { Placements, RaidPlan, SlotRef } from "@/games/wow-forever/types/raidPlan";

interface Draft {
  /** The plan as last read or saved. */
  plan: RaidPlan;
  /** Where its players sit in it. */
  saved: Placements;
  placements: Placements;
  published: boolean;
}

type Action =
  | { type: "reset"; plan: RaidPlan }
  | { type: "place"; playerId: string; seat: SlotRef | null }
  | { type: "autoFill" }
  | { type: "clear" }
  | { type: "setPublished"; published: boolean };

export interface GroupPlan {
  plan: RaidPlan;
  placements: Placements;
  published: boolean;
  /** Anything changed since the last read or save. */
  dirty: boolean;
  /** Show `plan` as read: after a save, a reload, or someone else's save. */
  reset: (plan: RaidPlan) => void;
  /** Into `seat` — swapping with whoever sits there — or, with null, out of the groups. */
  place: (playerId: string, seat: SlotRef | null) => void;
  /** Fill the empty seats with the players in no group. */
  autoFill: () => void;
  /** Everyone out of the groups. */
  clear: () => void;
  setPublished: (published: boolean) => void;
}

export function useGroupPlan(initialPlan: RaidPlan): GroupPlan {
  const [draft, dispatch] = useReducer(reduce, initialPlan, draftOf);
  const actions = useMemo(
    () => ({
      reset: (plan: RaidPlan) => dispatch({ type: "reset", plan }),
      place: (playerId: string, seat: SlotRef | null) => dispatch({ type: "place", playerId, seat }),
      autoFill: () => dispatch({ type: "autoFill" }),
      clear: () => dispatch({ type: "clear" }),
      setPublished: (published: boolean) => dispatch({ type: "setPublished", published }),
    }),
    [],
  );
  const dirty = draft.published !== draft.plan.published || !samePlacements(draft.placements, draft.saved);
  return { plan: draft.plan, placements: draft.placements, published: draft.published, dirty, ...actions };
}

function draftOf(plan: RaidPlan): Draft {
  const saved = placementsOf(plan);
  return { plan, saved, placements: saved, published: plan.published };
}

function reduce(draft: Draft, action: Action): Draft {
  switch (action.type) {
    case "reset":
      return draftOf(action.plan);
    case "place":
      return { ...draft, placements: swapOrPlace(draft.placements, action.playerId, action.seat) };
    case "autoFill":
      return { ...draft, placements: autoFill(draft.plan.players, draft.placements, draft.plan.group_count) };
    case "clear":
      return { ...draft, placements: {} };
    case "setPublished":
      return { ...draft, published: action.published };
  }
}

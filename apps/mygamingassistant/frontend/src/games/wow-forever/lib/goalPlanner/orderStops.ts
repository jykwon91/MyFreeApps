/**
 * Put one phase's stops in travel order. Greedy nearest-next: from where you
 * are, of every stop still to do, go to the one whose best place is the
 * cheapest trip; repeat from there. Each stop can be done at any of its
 * places (any Tailoring trainer, any vendor of the recipe), so each step
 * tries the few places nearest by straight line with the real route planner
 * and keeps the quickest. A stop no known travel reaches goes last, at its
 * nearest place; a stop the map can't place at all is handed back unplaced.
 */
import type { PlannedLeg } from "@/games/wow-forever/types/goalPlanner/plannedLeg";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TravelModel } from "@/games/wow-forever/types/goalPlanner/travelModel";

export interface PhaseStop<P> {
  stop: PlanStop;
  option: StopOption;
  place: P;
  leg: PlannedLeg | null;
}

export interface OrderedPhase<P> {
  stops: PhaseStop<P>[];
  /** Where the phase ends: the start of the next. */
  end: P;
  unplaced: PlanStop[];
}

interface Candidate<P> {
  option: StopOption;
  place: P;
  estimate: number;
}

function candidates<P>(stop: PlanStop, from: P, model: TravelModel<P>, limit: number): Candidate<P>[] {
  return stop.options
    .flatMap((option) => {
      const place = model.at(option);
      return place === null ? [] : [{ option, place, estimate: model.estimate(from, place) }];
    })
    .sort((a, b) => a.estimate - b.estimate)
    .slice(0, limit);
}

/** The quickest of a stop's nearest places from `from`; its nearest with no leg when nothing reaches it. */
function bestPlace<P>(options: readonly Candidate<P>[], from: P, model: TravelModel<P>): { pick: Candidate<P>; leg: PlannedLeg | null } {
  let best: { pick: Candidate<P>; leg: PlannedLeg | null } = { pick: options[0], leg: null };
  for (const option of options) {
    const leg = model.travel(from, option.place);
    if (leg && (best.leg === null || leg.seconds < best.leg.seconds)) best = { pick: option, leg };
  }
  return best;
}

export function orderPhase<P>(start: P, stops: readonly PlanStop[], model: TravelModel<P>, limit: number): OrderedPhase<P> {
  const unplaced: PlanStop[] = [];
  const unreached: PhaseStop<P>[] = [];
  const ordered: PhaseStop<P>[] = [];
  let remaining = [...stops];
  let here = start;
  while (remaining.length) {
    let next: { stop: PlanStop; pick: Candidate<P>; leg: PlannedLeg } | null = null;
    const still: PlanStop[] = [];
    for (const stop of remaining) {
      const options = candidates(stop, here, model, limit);
      if (!options.length) {
        unplaced.push(stop);
        continue;
      }
      still.push(stop);
      const { pick, leg } = bestPlace(options, here, model);
      if (!leg) continue;
      if (next === null || leg.seconds < next.leg.seconds) next = { stop, pick, leg };
    }
    remaining = still;
    if (!next) {
      // Nothing left is reachable from here: list the rest at their nearest place.
      for (const stop of remaining) {
        const [nearest] = candidates(stop, here, model, 1);
        unreached.push({ stop, option: nearest.option, place: nearest.place, leg: null });
      }
      break;
    }
    const chosen = next;
    ordered.push({ stop: chosen.stop, option: chosen.pick.option, place: chosen.pick.place, leg: chosen.leg });
    here = chosen.pick.place;
    remaining = remaining.filter((s) => s !== chosen.stop);
  }
  return { stops: [...ordered, ...unreached], end: here, unplaced };
}

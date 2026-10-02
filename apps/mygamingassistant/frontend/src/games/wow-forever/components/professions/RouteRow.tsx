import RouteMatList, { type MatPlace } from "@/games/wow-forever/components/professions/RouteMatList";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { forFaction } from "@/games/wow-forever/lib/forFaction";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface RouteRowProps {
  step: RouteStep;
  faction: PlayerFaction;
  showChip: boolean;
  materialsLabel: string;
  sourceLabel: string;
  /** Where materials come from; with it, each of a row's `mats` opens to its sources. */
  matPlace?: MatPlace;
}

/** One route row: a card on phones, a table row from `sm` up. Milestones read as stage breaks. */
export default function RouteRow({ step, faction, showChip, materialsLabel, sourceLabel, matPlace }: RouteRowProps) {
  const chip = showChip && step.confidence === "unconfirmed" ? <UnconfirmedChip /> : null;

  if (step.kind === "milestone") {
    return (
      <li className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:gap-4 p-3 bg-muted/40">
        <p className="font-semibold">{step.skill}</p>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Milestone</p>
          <p className="font-semibold">
            {step.name} {chip}
          </p>
          <p className="text-sm">{forFaction(step.detail, faction)}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="grid gap-1 sm:grid-cols-[6rem_1fr_1fr_1fr] sm:gap-4 p-3">
      <p className="font-semibold">{step.skill}</p>
      <div className="space-y-1">
        <p className="font-medium">
          {step.name} {chip}
        </p>
        {step.note ? <p className="text-xs text-muted-foreground">{step.note}</p> : null}
      </div>
      <div className="text-sm">
        <p>
          <span className="sm:hidden text-muted-foreground">{materialsLabel}: </span>
          {forFaction(step.materials, faction)}
        </p>
        <RouteMatList mats={step.mats} matPlace={matPlace} />
      </div>
      <p className="text-sm">
        <span className="sm:hidden text-muted-foreground">{sourceLabel}: </span>
        {forFaction(step.source, faction)}
      </p>
    </li>
  );
}

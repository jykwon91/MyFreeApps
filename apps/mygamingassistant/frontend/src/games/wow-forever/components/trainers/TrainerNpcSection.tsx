import RankTrainerList from "@/games/wow-forever/components/professions/RankTrainerList";
import { RANK_RECIPES_COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";

interface TrainerNpcSectionProps {
  /** "Mage", "Pet", "Tailoring": the section reads "<name> trainers". */
  name: string;
  trainers: readonly RankTrainer[];
  zoneId: number | null;
  /** Shown when your faction has none in the data. */
  emptyMessage: string;
  /** When provided, trainer names become buttons that open the recipe list. */
  onSelectTrainer?: (npcId: number) => void;
}

/** A titled list of trainers for your faction, capitals first, each with coordinates and a map link. */
export default function TrainerNpcSection({ name, trainers, zoneId, emptyMessage, onSelectTrainer }: TrainerNpcSectionProps) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3 sm:p-4">
      <h3 className="font-semibold">{name} trainers</h3>
      {onSelectTrainer && trainers.length ? <p className="text-sm text-muted-foreground">{RANK_RECIPES_COPY.trainerHint}</p> : null}
      {trainers.length ? (
        <RankTrainerList label={name} trainers={trainers} zoneId={zoneId} onSelectTrainer={onSelectTrainer} />
      ) : (
        <EmptyStateNote message={emptyMessage} />
      )}
    </section>
  );
}

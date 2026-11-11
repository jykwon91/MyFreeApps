import RankTrainerList from "@/games/wow-forever/components/professions/RankTrainerList";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";

interface TrainerNpcSectionProps {
  /** "Mage", "Pet", "Tailoring": the section reads "<name> trainers". */
  name: string;
  trainers: readonly RankTrainer[];
  zoneId: number | null;
  /** Shown when your faction has none in the data. */
  emptyMessage: string;
}

/** A titled list of trainers for your faction, capitals first, each with coordinates and a map link. */
export default function TrainerNpcSection({ name, trainers, zoneId, emptyMessage }: TrainerNpcSectionProps) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3 sm:p-4">
      <h3 className="font-semibold">{name} trainers</h3>
      {trainers.length ? <RankTrainerList label={name} trainers={trainers} zoneId={zoneId} /> : <EmptyStateNote message={emptyMessage} />}
    </section>
  );
}

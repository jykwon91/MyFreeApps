import { useMemo } from "react";
import { Link } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import ProfessionRankCard from "@/games/wow-forever/components/trainers/ProfessionRankCard";
import TrainerNpcSection from "@/games/wow-forever/components/trainers/TrainerNpcSection";
import TrainersSkeleton from "@/games/wow-forever/components/trainers/TrainersSkeleton";
import { playerFactionLabel } from "@/games/wow-forever/data/playerFactionOptions";
import { PROFESSION_PARAM, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SERVICE_TAG } from "@/games/wow-forever/data/trainers/trainersConfig";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { useTrainerServices } from "@/games/wow-forever/hooks/useTrainerServices";
import { professionRankSteps } from "@/games/wow-forever/lib/trainers/professionRankSteps";
import { serviceTrainers } from "@/games/wow-forever/lib/trainers/serviceTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ProfessionTrainersViewProps {
  profession: GuideProfession;
  label: string;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** A profession: each rank and what it needs, then every trainer for your faction. */
export default function ProfessionTrainersView({ profession, label, faction, zoneId }: ProfessionTrainersViewProps) {
  const services = useTrainerServices();
  const servicesData = services.status === "ready" ? services.data : null;
  const steps = useMemo(() => professionRankSteps(profession), [profession]);
  const trainers = useMemo(
    () => (servicesData ? serviceTrainers(servicesData, SERVICE_KIND.professionTrainer, PROFESSION_SERVICE_TAG[profession], faction) : []),
    [servicesData, profession, faction],
  );
  if (services.status === "loading") return <TrainersSkeleton />;
  if (services.status === "error") {
    return <LoadErrorRetry message="Couldn't load the trainers." onRetry={services.retry} retrying={services.retrying} />;
  }
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="trainers-ranks">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="trainers-ranks" className="text-lg font-semibold">
            Ranks: what each one needs
          </h2>
          <Link
            to={`/wow-forever/professions?${PROFESSION_PARAM}=${profession}`}
            className="inline-flex items-center text-sm underline underline-offset-2 min-h-[44px]"
          >
            {label} guide: fastest route to 300
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">Skill numbers and levels are Classic's unless Forever has confirmed them.</p>
        <ul className="space-y-2">
          {steps.map((step) => (
            <ProfessionRankCard key={step.name} step={step} professionLabel={label} faction={faction} zoneId={zoneId} />
          ))}
        </ul>
      </section>
      <section className="space-y-3" aria-labelledby="trainers-where">
        <h2 id="trainers-where" className="text-lg font-semibold">
          Where to train
        </h2>
        <TrainerNpcSection
          name={label}
          trainers={trainers}
          zoneId={zoneId}
          emptyMessage={`No ${label} trainers for ${playerFactionLabel(faction)} in our trainer data (Classic).`}
        />
      </section>
    </div>
  );
}

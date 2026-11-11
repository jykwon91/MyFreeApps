import { useMemo } from "react";
import { Link } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import LevelUnlockLadder from "@/games/wow-forever/components/trainers/LevelUnlockLadder";
import TrainerNpcSection from "@/games/wow-forever/components/trainers/TrainerNpcSection";
import TrainersSkeleton from "@/games/wow-forever/components/trainers/TrainersSkeleton";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { SPELLBOOK_PATH } from "@/games/wow-forever/data/spellbook/spellbookConfig";
import { CLASS_EXTRA_TRAINERS } from "@/games/wow-forever/data/trainers/trainersConfig";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { playerFactionLabel } from "@/games/wow-forever/data/playerFactionOptions";
import { useSpellbookClass } from "@/games/wow-forever/hooks/useSpellbookClass";
import { useTrainerServices } from "@/games/wow-forever/hooks/useTrainerServices";
import { levelUnlocks } from "@/games/wow-forever/lib/trainers/levelUnlocks";
import { serviceTrainers } from "@/games/wow-forever/lib/trainers/serviceTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ClassTrainersViewProps {
  classId: WowClassId;
  className: string;
  faction: PlayerFaction;
  level: number | null;
  zoneId: number | null;
}

/** A class: what it can learn at each level (Forever's files), then where its trainers stand (Classic). */
export default function ClassTrainersView({ classId, className, faction, level, zoneId }: ClassTrainersViewProps) {
  const book = useSpellbookClass(classId);
  const services = useTrainerServices();
  const bookData = book.status === "ready" ? book.data : null;
  const servicesData = services.status === "ready" ? services.data : null;
  const extra = CLASS_EXTRA_TRAINERS[classId];
  const ladder = useMemo(() => (bookData ? levelUnlocks(bookData) : []), [bookData]);
  const classTrainers = useMemo(
    () => (servicesData ? serviceTrainers(servicesData, SERVICE_KIND.classTrainer, classId, faction) : []),
    [servicesData, classId, faction],
  );
  const extraTrainers = useMemo(
    () => (servicesData && extra ? serviceTrainers(servicesData, extra.kind, null, faction) : []),
    [servicesData, extra, faction],
  );
  if (book.status === "loading" || services.status === "loading") return <TrainersSkeleton />;
  if (book.status === "error") return <LoadErrorRetry message="Couldn't load the spells." onRetry={book.retry} retrying={book.retrying} />;
  if (services.status === "error") {
    return <LoadErrorRetry message="Couldn't load the trainers." onRetry={services.retry} retrying={services.retrying} />;
  }
  const factionName = playerFactionLabel(faction);
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="trainers-unlocks">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="trainers-unlocks" className="text-lg font-semibold">
            What you can learn at each level
          </h2>
          <Link to={`${SPELLBOOK_PATH}/${classId}`} className="inline-flex items-center text-sm underline underline-offset-2 min-h-[44px]">
            Spell details and costs
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Learn levels are from the Forever game files ({book.data.clientBuild}). Talent ranks aren't listed — they come from talent points.
        </p>
        <LevelUnlockLadder ladder={ladder} level={level} />
      </section>
      <section className="space-y-3" aria-labelledby="trainers-where">
        <h2 id="trainers-where" className="text-lg font-semibold">
          Where to train
        </h2>
        <TrainerNpcSection
          name={className}
          trainers={classTrainers}
          zoneId={zoneId}
          emptyMessage={`Forever added ${factionName} ${className} trainers that our trainer data (Classic) doesn't have yet. Look near your race's starting area and in your capital.`}
        />
        {extra ? (
          <TrainerNpcSection
            name={extra.name}
            trainers={extraTrainers}
            zoneId={zoneId}
            emptyMessage={`No ${extra.name.toLowerCase()} trainers for ${factionName} in our trainer data (Classic).`}
          />
        ) : null}
      </section>
    </div>
  );
}

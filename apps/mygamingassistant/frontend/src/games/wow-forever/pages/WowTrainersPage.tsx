import { useParams } from "react-router-dom";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import ClassTrainersView from "@/games/wow-forever/components/trainers/ClassTrainersView";
import ProfessionTrainersView from "@/games/wow-forever/components/trainers/ProfessionTrainersView";
import TrainerSubjectPicker from "@/games/wow-forever/components/trainers/TrainerSubjectPicker";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { findTrainerSubject } from "@/games/wow-forever/data/trainers/trainerSubjects";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";

const PAGE_TITLE = "Trainers";

/** /wow-forever/trainers and /wow-forever/trainers/:subject — what a class or profession unlocks when, and who trains it. */
export default function WowTrainersPage() {
  const { subject: slug } = useParams<{ subject: string }>();
  const subject = slug ? findTrainerSubject(slug) : undefined;
  const [player, updatePlayer] = usePlayerSettings();
  useDocumentTitle(subject ? `${subject.label} trainers · WoW Forever` : `${PAGE_TITLE} · WoW Forever`);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title={subject ? `${subject.label} trainers` : PAGE_TITLE}
        subtitle="What every class and profession unlocks at each level, and where its trainers are for your faction."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <TrainerSubjectPicker current={subject?.id ?? null} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <SegmentedToggle
            label="Faction"
            options={PLAYER_FACTION_OPTIONS}
            value={player.faction}
            onChange={(faction) => updatePlayer({ faction })}
          />
          <NumberField
            label="Your level"
            value={player.level}
            min={1}
            max={levelCap()}
            onChange={(level) => updatePlayer({ level: playerLevel(level) })}
            className="flex flex-col gap-1 w-32"
          />
        </div>
        <LevelCapNote />
      </div>
      {subject?.kind === "class" ? (
        <ClassTrainersView
          key={subject.id}
          classId={subject.id}
          className={subject.label}
          faction={player.faction}
          level={player.level}
          zoneId={player.zoneId}
        />
      ) : null}
      {subject?.kind === "profession" ? (
        <ProfessionTrainersView key={subject.id} profession={subject.id} label={subject.label} faction={player.faction} zoneId={player.zoneId} />
      ) : null}
      {!subject && slug ? <EmptyStateNote message={`There's no class or profession called "${slug}". Pick one above.`} /> : null}
      {!slug ? <EmptyStateNote message="Pick a class or profession to see what it unlocks and where to train it." /> : null}
    </div>
  );
}

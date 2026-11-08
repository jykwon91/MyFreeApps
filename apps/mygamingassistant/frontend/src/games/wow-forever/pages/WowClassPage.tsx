import { useParams } from "react-router-dom";
import ClassNavLinks from "@/games/wow-forever/components/classes/ClassNavLinks";
import ClassPageSkeleton from "@/games/wow-forever/components/classes/ClassPageSkeleton";
import ClassProficienciesSection from "@/games/wow-forever/components/classes/ClassProficienciesSection";
import ClassRacesSection from "@/games/wow-forever/components/classes/ClassRacesSection";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { findClass, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { CLASSES_PATH } from "@/games/wow-forever/data/classes/classesConfig";
import { CLASS_PROFICIENCIES } from "@/games/wow-forever/data/gear/classProficiencies";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRaces } from "@/games/wow-forever/hooks/useRaces";
import { racesForClass } from "@/games/wow-forever/lib/classes/classRaces";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { RACES_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import type { ClassDetailsFile } from "@/games/wow-forever/types/classes/classDetailsFile";
import classDetailsRaw from "@/games/wow-forever/data/classes/classDetails.json";

const CLASS_DETAILS = (classDetailsRaw as unknown as ClassDetailsFile).classes;

const RESOURCE_LABEL: Record<string, string> = {
  mana: "Mana",
  rage: "Rage",
  energy: "Energy",
};

/** /wow-forever/classes/:class — class hub page: icon, roles, races, proficiencies and links. */
export default function WowClassPage() {
  const { class: classParam } = useParams<{ class: string }>();
  const wowClass = classParam ? findClass(classParam) : undefined;
  useDocumentTitle(wowClass ? `${wowClass.name} · WoW Forever` : "Classes · WoW Forever");

  if (!classParam || !wowClass) {
    return (
      <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
        <WowPageHeader
          title="Classes"
          subtitle="Pick a class."
          backTo="/wow-forever"
          backLabel="Back to WoW Forever"
        />
        <EmptyStateNote message={classParam ? `There's no class called "${classParam}".` : "Pick a class to get started."} />
        <ClassPickerList />
      </main>
    );
  }

  const detail = CLASS_DETAILS[wowClass.id];
  const proficiency = CLASS_PROFICIENCIES[wowClass.id];
  const roles = uniqueRoleLabels(wowClass.specs.map((s) => s.role));

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title={wowClass.name}
        subtitle="Races, proficiencies, spellbook, talents, macros and what Forever changed."
        backTo={CLASSES_PATH}
        backLabel="All classes"
      />

      {/* Class header: icon, roles, resource */}
      <div className="flex items-center gap-4" data-testid="class-page-header">
        {detail ? <GameIcon icon={fileIcon(detail.icon)} size={48} alt={wowClass.name} /> : null}
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold">{wowClass.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{roles}</span>
            {detail ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                data-testid="class-resource"
              >
                {RESOURCE_LABEL[detail.resource] ?? detail.resource}
                <ProvenanceBadge provenance={PROVENANCE.client} />
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <ClassRacesLoader classId={wowClass.id} />

      {proficiency ? <ClassProficienciesSection proficiency={proficiency} /> : null}
      <ClassNavLinks classId={wowClass.id} wowClass={wowClass} />
    </main>
  );
}

/** Loads race data and renders the races section or its skeleton. */
function ClassRacesLoader({ classId }: { classId: WowClassId }) {
  const state = useRaces();
  if (state.status === RACES_STATUS.loading) {
    return <ClassPageSkeleton />;
  }
  if (state.status === RACES_STATUS.error) {
    return null;
  }
  const races = racesForClass(classId, state.data.races);
  return <ClassRacesSection races={races} />;
}

/** Narrow sub-nav listing all classes when the URL is unknown. */
function ClassPickerList() {
  return (
    <ul className="flex flex-wrap gap-2">
      {WOW_CLASSES.map((c) => (
        <li key={c.id}>
          <a
            href={`${CLASSES_PATH}/${c.id}`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm min-h-[44px] bg-card hover:bg-muted/40 transition-colors"
          >
            {c.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

function uniqueRoleLabels(specRoles: readonly string[]): string {
  const parts: string[] = [];
  if (specRoles.includes("healer")) parts.push("Healer");
  if (specRoles.includes("tank")) parts.push("Tank");
  if (specRoles.some((r) => r === "caster" || r === "melee" || r === "ranged")) parts.push("DPS");
  return parts.join(" · ");
}

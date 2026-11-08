import { Link, useParams } from "react-router-dom";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import TalentClassPicker from "@/games/wow-forever/components/talents/TalentClassPicker";
import TalentClassView from "@/games/wow-forever/components/talents/TalentClassView";
import { findClass } from "@/games/wow-forever/data/classes";
import { CLASSES_PATH } from "@/games/wow-forever/data/classes/classesConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

const PAGE_TITLE = "Talent calculator";
const CLASS_LINK_STYLE = "inline-flex min-h-[44px] items-center text-sm underline underline-offset-2";

/** /wow-forever/talents and /wow-forever/talents/:class — plan a build and share it as a link. */
export default function WowTalentsPage() {
  const { class: classParam } = useParams<{ class: string }>();
  const wowClass = classParam ? findClass(classParam) : undefined;
  useDocumentTitle(wowClass ? `${wowClass.name} talents · WoW Forever` : `${PAGE_TITLE} · WoW Forever`);

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-6xl">
      <WowPageHeader
        title={wowClass ? `${wowClass.name} talents` : PAGE_TITLE}
        subtitle="Plan a talent build for any level, with Forever's own talent text, and share it as a link."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <TalentClassPicker current={wowClass?.id ?? null} />
      {wowClass ? (
        <>
          <Link to={`${CLASSES_PATH}/${wowClass.id}`} className={CLASS_LINK_STYLE} data-testid="talents-class-hub-link">
            {wowClass.name} class page
          </Link>
          <TalentClassView classId={wowClass.id} />
        </>
      ) : null}
      {!wowClass && classParam ? <EmptyStateNote message={`There's no class called "${classParam}". Pick one above.`} /> : null}
      {!classParam ? <EmptyStateNote message="Pick a class to start." /> : null}
    </main>
  );
}

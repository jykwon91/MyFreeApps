import { useParams } from "react-router-dom";
import ClassLinkPicker from "@/games/wow-forever/components/shared/ClassLinkPicker";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import SpellbookClassView from "@/games/wow-forever/components/spellbook/SpellbookClassView";
import { findClass } from "@/games/wow-forever/data/classes";
import { SPELLBOOK_PATH } from "@/games/wow-forever/data/spellbook/spellbookConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

const PAGE_TITLE = "Spellbook";

/** /wow-forever/spellbook and /wow-forever/spellbook/:class — every spell a class can train in Forever. */
export default function WowSpellbookPage() {
  const { class: classParam } = useParams<{ class: string }>();
  const wowClass = classParam ? findClass(classParam) : undefined;
  useDocumentTitle(wowClass ? `${wowClass.name} spellbook · WoW Forever` : `${PAGE_TITLE} · WoW Forever`);

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title={wowClass ? `${wowClass.name} spellbook` : PAGE_TITLE}
        subtitle="Every spell a class can train in Forever: ranks, learn levels, costs, tooltips and what changed from Classic."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <ClassLinkPicker basePath={SPELLBOOK_PATH} current={wowClass?.id ?? null} testId="spellbook-class-picker" />
      {wowClass ? <SpellbookClassView classId={wowClass.id} /> : null}
      {!wowClass && classParam ? <EmptyStateNote message={`There's no class called "${classParam}". Pick one above.`} /> : null}
      {!classParam ? <EmptyStateNote message="Pick a class to see its spells." /> : null}
    </main>
  );
}

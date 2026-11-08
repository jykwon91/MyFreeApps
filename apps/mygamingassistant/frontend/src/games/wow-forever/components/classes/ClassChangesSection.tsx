import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import ChangeSubSection from "@/games/wow-forever/components/classes/ChangeSubSection";
import { CHANGES_PATH, CHANGE_CATEGORY_PARAM, CHANGE_CLASS_PARAM } from "@/games/wow-forever/data/changes/changeFeedConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ClassChanges } from "@/games/wow-forever/hooks/useClassChanges";
import type { WowClassId } from "@/games/wow-forever/data/classes";

interface ClassChangesSectionProps {
  classId: WowClassId;
  data: ClassChanges;
}

/** Changed talents and class spells vs Classic — a preview with counts and "See all" links. */
export default function ClassChangesSection({ classId, data }: ClassChangesSectionProps) {
  const talentsUrl = `${CHANGES_PATH}?${new URLSearchParams({ [CHANGE_CLASS_PARAM]: classId })}`;
  const spellsUrl = `${CHANGES_PATH}?${new URLSearchParams({ [CHANGE_CATEGORY_PARAM]: "spells", [CHANGE_CLASS_PARAM]: classId })}`;

  return (
    <section aria-labelledby="class-changes-heading" className="space-y-4" data-testid="class-changes-section">
      <h2
        id="class-changes-heading"
        className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Changed vs Classic
        <ProvenanceBadge provenance={PROVENANCE.classic} />
      </h2>

      <ChangeSubSection
        heading="Talents"
        entries={data.talents}
        seeAllHref={talentsUrl}
        testId="class-changes-talents"
      />

      <ChangeSubSection
        heading="Class spells"
        entries={data.spells}
        spellbookClassId={classId}
        seeAllHref={spellsUrl}
        testId="class-changes-spells"
      />
    </section>
  );
}

import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { SPELLBOOK_CLASSIC_DETAIL } from "@/games/wow-forever/data/spellbook/spellbookProvenance";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface SpellRankLevelProps {
  level: number | null;
  classic: boolean;
}

/** "Level 20", tagged Classic data when only Classic gives it; "Level unknown" when nothing does. */
export default function SpellRankLevel({ level, classic }: SpellRankLevelProps) {
  if (level === null) return <span className="text-muted-foreground">Level unknown</span>;
  return (
    <span className="inline-flex items-center gap-1">
      Level {level}
      {classic ? <ProvenanceBadge provenance={PROVENANCE.classic} detail={SPELLBOOK_CLASSIC_DETAIL.level} /> : null}
    </span>
  );
}

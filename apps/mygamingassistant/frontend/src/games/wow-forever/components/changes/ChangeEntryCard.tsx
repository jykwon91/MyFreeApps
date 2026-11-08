import ChangeEntryName from "@/games/wow-forever/components/changes/ChangeEntryName";
import ChangeRowsTable from "@/games/wow-forever/components/changes/ChangeRowsTable";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { CHANGE_KIND_LABEL } from "@/games/wow-forever/data/changes/changeCategories";
import { findClass } from "@/games/wow-forever/data/classes";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

const CHIP = "rounded-full border px-2 py-0.5 text-xs text-muted-foreground";

/**
 * One change: icon, name (linked to our own page when there is one), what
 * changed in words, then old and new side by side. The badges say where each
 * side comes from: Forever's (Game files, or Seen in game) and, when there's a
 * Classic side, Classic data.
 */
export default function ChangeEntryCard({ entry }: { entry: ChangeEntry }) {
  const classNames = entry.classes.map((id) => findClass(id)?.name ?? id).join(", ");
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" data-testid="change-entry" data-kind={entry.kind}>
      <div className="flex items-start gap-3">
        <GameIcon icon={entry.icon} size={32} alt="" className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-medium leading-snug break-words">
            <ChangeEntryName entry={entry} />
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className={CHIP}>{CHANGE_KIND_LABEL[entry.kind]}</span>
            {classNames ? <span className={CHIP}>{classNames}</span> : null}
            <ProvenanceBadge {...entry.provenance} />
            {entry.kind === "changed" ? <ProvenanceBadge provenance={PROVENANCE.classic} /> : null}
          </div>
        </div>
      </div>
      <p className="text-sm">{entry.summary}</p>
      {entry.rows.length > 0 ? <ChangeRowsTable rows={entry.rows} /> : null}
    </li>
  );
}

import { AlertBox } from "@platform/ui";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { confidenceProvenance } from "@/games/wow-forever/lib/provenance/confidenceProvenance";
import { FOREVER_CHANGES } from "@/games/wow-forever/data/professions/foreverChanges";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import type { ForeverChange } from "@/games/wow-forever/data/professions/professionTypes";

/** What Forever changed for a profession; each unconfirmed change is tagged with what it rests on. */
export default function ForeverChangesBox({ changes = FOREVER_CHANGES }: { changes?: readonly ForeverChange[] }) {
  return (
    <AlertBox variant="info">
      <ul className="list-disc pl-5 space-y-1">
        {changes.map((c) => {
          const tag = confidenceProvenance(c.confidence, c.basis);
          return (
            <li key={c.text}>
              {c.text} {tag ? <ProvenanceBadge {...tag} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2">
        Checked against the Forever launch client and Blizzard's posts on {PROFESSIONS_DATA_STATUS.checkedOn} — Blizzard can
        still change details.
      </p>
    </AlertBox>
  );
}

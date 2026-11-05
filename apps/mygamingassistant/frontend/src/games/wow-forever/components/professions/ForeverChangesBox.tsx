import { AlertBox } from "@platform/ui";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { FOREVER_CHANGES } from "@/games/wow-forever/data/professions/foreverChanges";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import type { ForeverChange } from "@/games/wow-forever/data/professions/professionTypes";

export default function ForeverChangesBox({ changes = FOREVER_CHANGES }: { changes?: readonly ForeverChange[] }) {
  return (
    <AlertBox variant="info">
      <ul className="list-disc pl-5 space-y-1">
        {changes.map((c) => (
          <li key={c.text}>
            {c.text} {c.confidence === "unconfirmed" ? <UnconfirmedChip /> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Checked against the Forever launch client and Blizzard's posts on {PROFESSIONS_DATA_STATUS.checkedOn} — Blizzard can
        still change details.
      </p>
    </AlertBox>
  );
}

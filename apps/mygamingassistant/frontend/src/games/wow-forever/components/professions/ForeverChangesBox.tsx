import { AlertBox } from "@platform/ui";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { FOREVER_CHANGES } from "@/games/wow-forever/data/professions/foreverChanges";

export default function ForeverChangesBox() {
  return (
    <AlertBox variant="info">
      <ul className="list-disc pl-5 space-y-1">
        {FOREVER_CHANGES.map((c) => (
          <li key={c.text}>
            {c.text} {c.confidence === "unconfirmed" ? <UnconfirmedChip /> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2">Forever is in beta — details can still change before launch.</p>
    </AlertBox>
  );
}

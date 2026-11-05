import { AlertBox } from "@platform/ui";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { ADDON_PICKS } from "@/games/wow-forever/data/guide/professions";

export default function AddonsSection() {
  return (
    <GuideSection id="addons" title="Addons" intro="Popular Classic addons that make the game easier to learn.">
      <AlertBox variant="warning">
        Blizzard hasn't published a full addon policy for Forever. Forever runs modern WoW's addon system, not
        Classic's, so you need each addon's Forever version — and in the beta, addons couldn't read combat data. Some of
        these may not work, or be allowed.
      </AlertBox>
      <ul className="rounded-xl border bg-card divide-y">
        {ADDON_PICKS.map((a) => (
          <li key={a.name} className="p-3 text-sm">
            <span className="font-medium">{a.name}</span> — {a.what}
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}

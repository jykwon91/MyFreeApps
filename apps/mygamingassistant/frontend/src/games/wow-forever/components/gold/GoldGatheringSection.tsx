import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { GATHERING_TIPS } from "@/games/wow-forever/data/gold/goldTips";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";

/** The three gathering professions — the steadiest gold while leveling. */
export default function GoldGatheringSection() {
  return (
    <GuideSection
      id="gathering"
      title="Gathering professions"
      intro="Gathering costs almost nothing to level and everything it gathers sells. Most players making gold take two."
    >
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {GATHERING_TIPS.map((g) => (
          <li key={g.profession} className="rounded-xl border bg-card p-3 space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <GameIcon icon={professionIcon(g.id)} size={24} alt="" />
              {g.profession}
            </p>
            <p className="text-sm">{g.what}</p>
            <p className="text-xs text-muted-foreground">Pairs with {g.pairsWith}</p>
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}

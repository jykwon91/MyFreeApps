import GearPhaseBanner from "@/games/wow-forever/components/gear/GearPhaseBanner";
import GearRankingSection from "@/games/wow-forever/components/gear/GearRankingSection";
import GearSettingsBar from "@/games/wow-forever/components/gear/GearSettingsBar";
import BisListsView from "@/games/wow-forever/components/gear/bisLists/BisListsView";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { GEAR_VIEW, GEAR_VIEWS } from "@/games/wow-forever/data/gear/gearViews";
import { useGearData } from "@/games/wow-forever/hooks/useGearData";
import { useGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import { useSharedBisListLink } from "@/games/wow-forever/hooks/useSharedBisListLink";

/** /wow-forever/gear — the top items per slot for your class, spec and level (leveling, then pre-raid at 60), and your own lists. */
export default function WowGearPage() {
  const [settings, update] = useGearSettings();
  const state = useGearData();
  const shared = useSharedBisListLink();
  // A share link always opens "My lists", whatever view was saved.
  const mine = settings.view === GEAR_VIEW.mine || shared.present;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <WowPageHeader
        title="Best gear"
        subtitle="The top items per slot for your class, spec and level — the next upgrades while leveling, then a pre-raid list for level 60 — and lists of your own to share."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <GearPhaseBanner />
      {mine ? null : <GearSettingsBar settings={settings} onChange={update} />}
      {/* Choosing another view leaves a share link's fragment; "My lists" again keeps the shared list open. */}
      <SegmentedToggle
        label="Which list"
        options={GEAR_VIEWS}
        value={mine ? GEAR_VIEW.mine : settings.view}
        onChange={(view) => {
          if (shared.present && view === GEAR_VIEW.mine) return;
          update({ view });
        }}
        className="flex-wrap"
      />
      {mine ? (
        <BisListsView settings={settings} state={state} shared={shared} onFactionChange={(faction) => update({ faction })} />
      ) : (
        <GearRankingSection settings={settings} state={state} />
      )}
    </div>
  );
}

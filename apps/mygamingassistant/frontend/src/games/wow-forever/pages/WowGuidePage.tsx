import AddonsSection from "@/games/wow-forever/components/guide/AddonsSection";
import BeginnerChecklistSection from "@/games/wow-forever/components/guide/BeginnerChecklistSection";
import ClassPicksSection from "@/games/wow-forever/components/guide/ClassPicksSection";
import DungeonBasicsSection from "@/games/wow-forever/components/guide/DungeonBasicsSection";
import GuideSectionNav from "@/games/wow-forever/components/guide/GuideSectionNav";
import LevelingZonesSection from "@/games/wow-forever/components/guide/LevelingZonesSection";
import ProfessionsSection from "@/games/wow-forever/components/guide/ProfessionsSection";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";

/** /wow-forever/guide — static New Player Guide. */
export default function WowGuidePage() {
  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="New Player Guide"
        subtitle="Everything you need for your first character in World of Warcraft: Forever."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <GuideSectionNav />
      <ClassPicksSection />
      <BeginnerChecklistSection />
      <LevelingZonesSection />
      <ProfessionsSection />
      <AddonsSection />
      <DungeonBasicsSection />
    </main>
  );
}

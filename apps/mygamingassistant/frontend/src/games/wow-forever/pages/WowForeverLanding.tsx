import { AlertBox } from "@platform/ui";
import HubAskBox from "@/games/wow-forever/components/hub/HubAskBox";
import WowFeatureTile from "@/games/wow-forever/components/hub/WowFeatureTile";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import WowServerStatusSection from "@/games/wow-forever/components/serverStatus/WowServerStatusSection";
import DataRefreshLine from "@/games/wow-forever/components/whatsNew/DataRefreshLine";
import WhatsNewSection from "@/games/wow-forever/components/whatsNew/WhatsNewSection";
import { WHATS_NEW } from "@/games/wow-forever/data/whatsNew";
import { useUpdateDots } from "@/games/wow-forever/hooks/useUpdateDots";
import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";

/** /wow-forever — entry point for the WoW Forever companion pages. */
export default function WowForeverLanding() {
  const features = COMPANION_GAMES[WOW_FOREVER_SLUG].features;
  const updates = useUpdateDots();
  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="space-y-2">
        <WowPageHeader
          title="World of Warcraft: Forever"
          subtitle="World map with directions, profession leveling guides, gear compare and more."
          backTo="/"
          backLabel="Back to games"
        />
        <DataRefreshLine />
      </div>
      <HubAskBox />
      <WowServerStatusSection />
      <WhatsNewSection entries={WHATS_NEW} />
      <AlertBox variant="info">
        Much of this is based on Classic Era. Facts are tagged with where they come from — see &ldquo;How to read these
        tags&rdquo; at the bottom of each page.
      </AlertBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <WowFeatureTile key={f.path} feature={f} hasUpdate={updates.has(f.path)} />
        ))}
      </div>
    </div>
  );
}

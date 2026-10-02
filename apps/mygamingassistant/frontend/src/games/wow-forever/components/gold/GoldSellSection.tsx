import GoldTipList from "@/games/wow-forever/components/gold/GoldTipList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { AH_BASICS, SELL_ITEMS, VENDOR_ITEMS } from "@/games/wow-forever/data/gold/goldTips";

/** What to put on the auction house, what to vendor, and how to post. */
export default function GoldSellSection() {
  return (
    <GuideSection id="sell" title="Keep or vendor?" intro="Keep means sell it to players at the auction house, or hold it until you can.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold">Keep</h3>
          <GoldTipList tips={SELL_ITEMS} />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Vendor</h3>
          <GoldTipList tips={VENDOR_ITEMS} />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Auction house basics</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {AH_BASICS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </GuideSection>
  );
}

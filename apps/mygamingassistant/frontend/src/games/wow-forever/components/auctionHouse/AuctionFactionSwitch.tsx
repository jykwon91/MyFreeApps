import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { PRICE_FACTION_LABEL, PRICE_FACTIONS } from "@/games/wow-forever/data/priceFactions";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

const OPTIONS = PRICE_FACTIONS.map((id) => ({ id, label: PRICE_FACTION_LABEL[id] }));

interface AuctionFactionSwitchProps {
  value: PriceFaction;
  onChange: (next: PriceFaction) => void;
}

/** Alliance / Horde / Blackwater: each faction's auction houses have their own prices. */
export default function AuctionFactionSwitch({ value, onChange }: AuctionFactionSwitchProps) {
  return <SegmentedToggle label="Auction house" options={OPTIONS} value={value} onChange={onChange} />;
}

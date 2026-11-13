import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { AlertBox } from "@platform/ui";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import ProfessionAuctionReady from "@/games/wow-forever/components/auctionHouse/ProfessionAuctionReady";
import { useCraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import type { ProfessionAuctionProps } from "@/games/wow-forever/types/auctionHouse/professionAuctionProps";

/** The Auction house narrowed to one profession: its materials, or one recipe's. Loads the profession's recipes first. */
export default function ProfessionAuction(props: ProfessionAuctionProps) {
  const state = useCraftingData(props.profession);
  if (state.status === LOAD_STATUS.loading) return <AuctionResultsSkeleton />;
  if (state.status === LOAD_STATUS.error) {
    return (
      <AlertBox variant="error">
        Couldn&apos;t load the {props.professionLabel} recipes.{" "}
        <button type="button" onClick={state.retry} className="min-h-[44px] underline">
          Try again
        </button>
      </AlertBox>
    );
  }
  return <ProfessionAuctionReady {...props} data={state.data} />;
}

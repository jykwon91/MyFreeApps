import { Skeleton } from "@platform/ui";
import AuctionPriceValue from "@/games/wow-forever/components/prices/AuctionPriceValue";

interface ProfessionPriceCellProps {
  /** Copper; null = no auction price. */
  copper: number | null;
  /** True while the prices load. */
  loading: boolean;
}

/** An auction price: a skeleton while loading, "no auction price" when it has none. */
export default function ProfessionPriceCell({ copper, loading }: ProfessionPriceCellProps) {
  if (loading) return <Skeleton className="h-4 w-14" />;
  return <AuctionPriceValue copper={copper ?? undefined} />;
}

import { Skeleton } from "@platform/ui";
import AuctionPriceValue from "@/games/wow-forever/components/prices/AuctionPriceValue";

interface WritPriceCellProps {
  /** Copper; null = no auction price. */
  copper: number | null;
  /** True while the prices load. */
  loading: boolean;
}

/** A writ's or item's auction price: a skeleton while loading, "no auction price" when it has none. */
export default function WritPriceCell({ copper, loading }: WritPriceCellProps) {
  if (loading) return <Skeleton className="h-4 w-14" />;
  return <AuctionPriceValue copper={copper ?? undefined} />;
}

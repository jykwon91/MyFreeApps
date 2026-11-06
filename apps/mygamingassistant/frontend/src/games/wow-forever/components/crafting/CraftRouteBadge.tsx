import { Badge } from "@platform/ui";

/** Which route is showing on a priced guide: the cheapest at auction prices, or the default. */
export default function CraftRouteBadge({ cheapest }: { cheapest: boolean }) {
  if (cheapest) return <Badge label="Cheapest at auction prices" color="green" />;
  return <Badge label="Default route" color="gray" />;
}

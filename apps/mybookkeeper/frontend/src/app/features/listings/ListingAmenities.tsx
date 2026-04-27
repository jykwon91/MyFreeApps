import { useState } from "react";

interface Props {
  amenities: string[];
}

const COLLAPSE_THRESHOLD = 6;

/**
 * Chip row of amenities. On mobile when there are more than COLLAPSE_THRESHOLD,
 * the extras are hidden behind a "Show more" toggle to keep the list page
 * compact. Desktop shows everything inline because vertical real estate is
 * cheaper there.
 */
export default function ListingAmenities({ amenities }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (amenities.length === 0) {
    return <p className="text-sm text-muted-foreground">No amenities listed.</p>;
  }

  const showAll = expanded || amenities.length <= COLLAPSE_THRESHOLD;
  const visible = showAll ? amenities : amenities.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = amenities.length - COLLAPSE_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visible.map((amenity) => (
          <span
            key={amenity}
            className="inline-block rounded-full bg-muted text-foreground/80 px-3 py-1 text-xs"
          >
            {amenity}
          </span>
        ))}
      </div>
      {!showAll ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-primary hover:underline min-h-[44px] md:min-h-0"
        >
          Show {hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}

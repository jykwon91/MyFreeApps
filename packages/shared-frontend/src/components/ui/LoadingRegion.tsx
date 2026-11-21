import type { HTMLAttributes, ReactNode } from "react";
import { LoadingRegionContext } from "./loadingRegionContext";
import LoadingStatus from "./LoadingStatus";

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "role" | "aria-busy" | "aria-label"> {
  /** What a screen reader announces once, e.g. "Loading transactions…". */
  label: string;
  children?: ReactNode;
}

/**
 * Wraps a loading placeholder so assistive tech knows the region is busy and
 * hears a single polite status. The visible skeleton blocks inside are
 * aria-hidden (see Skeleton), so only the label is read. The status is the
 * region's next sibling, not a child, so it can't disturb `space-y-*`, `first:`
 * or child-count styling inside the region.
 * The label also names the region for selectors. A LoadingRegion nested in another stays busy but doesn't announce again.
 */
export default function LoadingRegion({ label, children, ...rest }: Props) {
  return (
    <>
      <div {...rest} aria-busy="true" aria-label={label}>
        <LoadingRegionContext.Provider value={true}>{children}</LoadingRegionContext.Provider>
      </div>
      <LoadingStatus label={label} />
    </>
  );
}

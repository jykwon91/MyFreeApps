import { useContext } from "react";
import { LoadingRegionContext } from "./loadingRegionContext";

interface Props {
  /** What a screen reader announces once, e.g. "Loading transactions…". */
  label: string;
}

/**
 * A visually hidden polite status. Use it directly where a placeholder can't
 * be wrapped in a LoadingRegion without disturbing its parent's layout; inside
 * a LoadingRegion it renders nothing, since the region already announced.
 */
export default function LoadingStatus({ label }: Props) {
  const insideRegion = useContext(LoadingRegionContext);
  if (insideRegion) return null;

  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

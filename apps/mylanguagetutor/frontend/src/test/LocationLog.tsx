import { useLocation } from "react-router-dom";

interface LocationLogProps {
  /** Gets every pathname the router renders, in order. */
  visited: string[];
}

/** Records where the router has been, to catch a page that was only passed through. */
export default function LocationLog({ visited }: LocationLogProps) {
  visited.push(useLocation().pathname);
  return null;
}

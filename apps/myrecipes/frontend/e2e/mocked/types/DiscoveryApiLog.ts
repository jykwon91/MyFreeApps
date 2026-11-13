import type { DiscoveryReadRequest } from "./DiscoveryReadRequest";

/** What the page asked of the stubbed discovery API, and the gate that holds its answers. */
export interface DiscoveryApiLog {
  /** The query of every POST /discovery/search. */
  searches: string[];
  /** The body of every POST /discovery/detail. */
  reads: DiscoveryReadRequest[];
  /** Answers a held search or read; a no-op when nothing is held. */
  release: () => void;
}

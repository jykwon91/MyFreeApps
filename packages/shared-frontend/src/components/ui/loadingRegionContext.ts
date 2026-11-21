import { createContext } from "react";

/** True beneath a LoadingRegion, so nested placeholders don't announce a second status. */
export const LoadingRegionContext = createContext(false);

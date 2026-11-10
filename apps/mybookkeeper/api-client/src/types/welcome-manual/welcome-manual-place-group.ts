import type { WelcomeManualPlaceResponse } from "./welcome-manual-place-response";

/** The places of one cuisine. */
export interface WelcomeManualPlaceGroup {
  cuisine: string;
  places: WelcomeManualPlaceResponse[];
}

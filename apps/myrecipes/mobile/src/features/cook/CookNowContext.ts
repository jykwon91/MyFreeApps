import { createContext } from "react";

/** The cook screen's clock, from CookTimerClock. Null outside it. */
export const CookNowContext = createContext<number | null>(null);

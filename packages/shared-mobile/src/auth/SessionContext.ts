import { createContext } from "react";
import type { MobileSession } from "../types/MobileSession";

export const SessionContext = createContext<MobileSession | null>(null);

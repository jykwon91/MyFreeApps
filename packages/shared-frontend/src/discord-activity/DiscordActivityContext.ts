import { createContext } from "react";
import type { DiscordActivityState } from "./types/DiscordActivityState";

/** Provided by `DiscordActivityProvider`; `null` means no provider is mounted. */
export const DiscordActivityContext = createContext<DiscordActivityState | null>(null);

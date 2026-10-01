import { useContext } from "react";
import { DiscordActivityContext } from "./DiscordActivityContext";
import type { DiscordActivityState } from "./types/DiscordActivityState";

/** Whether the app runs inside Discord and how the connection is going. */
export function useDiscordActivity(): DiscordActivityState {
  const state = useContext(DiscordActivityContext);
  if (state === null) {
    throw new Error("useDiscordActivity() must be used inside <DiscordActivityProvider>.");
  }
  return state;
}

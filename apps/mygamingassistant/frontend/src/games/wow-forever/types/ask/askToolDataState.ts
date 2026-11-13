import type { LoadStatus } from "@/games/wow-forever/types/loadStatus";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";

/** `useAskToolData`: the data the tools run on, its load state, and the saved player (editable from the location chip). */
export interface AskToolDataState {
  status: LoadStatus;
  /** Null until the World Map has loaded. */
  data: AskToolData | null;
  retry: () => void;
  player: PlayerSettings;
  updatePlayer: (patch: Partial<PlayerSettings>) => void;
}

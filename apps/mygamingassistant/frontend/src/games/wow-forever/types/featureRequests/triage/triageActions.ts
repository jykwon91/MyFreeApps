import type { useTriageActions } from "@/games/wow-forever/hooks/featureRequests/triage/useTriageActions";

/** Every triage write the screen can make (see `useTriageActions`). */
export type TriageActions = ReturnType<typeof useTriageActions>;

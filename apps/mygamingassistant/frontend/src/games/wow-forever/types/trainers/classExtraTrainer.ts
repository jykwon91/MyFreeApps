import type { ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";

/** A trainer a class visits besides its class trainer; the page titles it "<name> trainers". */
export interface ClassExtraTrainer {
  kind: ServiceKind;
  name: string;
}

import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** A Classic quest fact: who gives it, its quest line, who takes it back. */
export const CLASSIC_QUEST_TAG: ProvenanceTag = { provenance: PROVENANCE.classic };

/** A Classic route, spot or location: zones to go to, trainer and spawn spots. */
export const CLASSIC_ROUTE_TAG: ProvenanceTag = { provenance: PROVENANCE.classic, detail: PROVENANCE_DETAIL.classicRoute };

/** A Classic game rule: skill-up colours, the skinning level rule. */
export const CLASSIC_RULE_TAG: ProvenanceTag = { provenance: PROVENANCE.classic, detail: PROVENANCE_DETAIL.classicRule };

/** Who teaches a profession rank: every Classic trainer for your faction. */
export const CLASSIC_TRAINERS_TAG: ProvenanceTag = { provenance: PROVENANCE.classic, detail: PROVENANCE_DETAIL.classicTrainers };

import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ClassDetail } from "@/games/wow-forever/types/classes/classDetail";

/** Shape of ``data/classes/classDetails.json`` as the generator writes it. */
export interface ClassDetailsFile {
  source: string;
  clientBuild: string;
  classes: Record<WowClassId, ClassDetail>;
}

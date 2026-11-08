import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";

/** The page's filters, kept in the URL. */
export interface ChangeFilters {
  /** One category at a time, so the page loads only that category's shards. */
  category: ChangeCategory;
  /** Null = every class; set = only rows for that class (class-tagged categories only). */
  classId: WowClassId | null;
  query: string;
  /** Only rows new or changed in the latest build. */
  sinceLastBuild: boolean;
}

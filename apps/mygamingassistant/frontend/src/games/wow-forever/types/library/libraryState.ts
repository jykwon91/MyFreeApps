import type { LIBRARY_STATUS } from "@/games/wow-forever/data/library/libraryConfig";
import type { LibraryData } from "@/games/wow-forever/types/library/libraryData";

/** The library data's load state (its own lazy chunk). */
export type LibraryState =
  | { status: typeof LIBRARY_STATUS.idle }
  | { status: typeof LIBRARY_STATUS.loading }
  | { status: typeof LIBRARY_STATUS.ready; data: LibraryData }
  | { status: typeof LIBRARY_STATUS.error; retry: () => void };

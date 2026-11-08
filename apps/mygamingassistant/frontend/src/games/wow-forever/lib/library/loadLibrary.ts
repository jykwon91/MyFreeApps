import { decodeLibrary } from "@/games/wow-forever/lib/library/decodeLibrary";
import type { LibraryData } from "@/games/wow-forever/types/library/libraryData";
import type { LibraryDataFile } from "@/games/wow-forever/types/library/libraryDataFile";

let cached: Promise<LibraryData> | null = null;

/** The library page's data, loaded once in its own chunk (a failed load is tried again next time). */
export function loadLibrary(): Promise<LibraryData> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/library/library.json").then((file) =>
      decodeLibrary(file.default as unknown as LibraryDataFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

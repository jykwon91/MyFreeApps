import { useEffect, useState } from "react";
import { LIBRARY_STATUS } from "@/games/wow-forever/data/library/libraryConfig";
import { loadLibrary } from "@/games/wow-forever/lib/library/loadLibrary";
import type { LibraryData } from "@/games/wow-forever/types/library/libraryData";
import type { LibraryState } from "@/games/wow-forever/types/library/libraryState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The library page's data, loaded on mount. */
export function useLibrary(): LibraryState {
  const [data, setData] = useState<LibraryData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadLibrary().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: LIBRARY_STATUS.ready, data };
  if (failed) return { status: LIBRARY_STATUS.error, retry: reloadPage };
  return { status: LIBRARY_STATUS.loading };
}

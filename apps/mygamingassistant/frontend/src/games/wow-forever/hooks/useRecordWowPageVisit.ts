import { useEffect } from "react";
import { WOW_HUB_PATH, WOW_PAGE_PATHS } from "@/games/wow-forever/data/wowPagePaths";
import { pageVisitStore } from "@/games/wow-forever/lib/whatsNew/pageVisitStore";
import { pageForPathname } from "@/games/wow-forever/lib/whatsNew/updateDots";

/** Records a visit to the WoW Forever page at `pathname` (if it is one), which clears its update dot. */
export function useRecordWowPageVisit(pathname: string): void {
  useEffect(() => {
    const page = pageForPathname(pathname, WOW_PAGE_PATHS, WOW_HUB_PATH);
    if (page) pageVisitStore.recordVisit(page);
  }, [pathname]);
}

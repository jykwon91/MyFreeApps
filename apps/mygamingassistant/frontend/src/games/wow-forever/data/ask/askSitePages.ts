import { ASK_GUIDE_PATH } from "@/games/wow-forever/data/ask/askGuidePages";
import type { AskSitePage } from "@/games/wow-forever/types/ask/askSitePage";

/**
 * Pages Claude is told to point to for questions its tools can't answer
 * (the system prompt in `chat_tool_schema.py`). A mention in an answer becomes a link.
 */
export const ASK_SITE_PAGES: readonly AskSitePage[] = [
  { title: "Professions", path: ASK_GUIDE_PATH.professions, mentions: ["professions"] },
  { title: "Making gold", path: ASK_GUIDE_PATH.gold, mentions: ["making gold"] },
  { title: "Macros", path: ASK_GUIDE_PATH.macros, mentions: ["macros"] },
  { title: "Talents", path: "/wow-forever/talents", mentions: ["talents"] },
  { title: "Auction house prices", path: ASK_GUIDE_PATH.auctionHouse, mentions: ["auction house"] },
  { title: "Best gear", path: "/wow-forever/gear", mentions: ["best gear"] },
];

import type { AskSitePage } from "@/games/wow-forever/types/ask/askSitePage";

/**
 * Pages Claude is told to point to for questions its tools can't answer
 * (the system prompt in `chat_tool_schema.py`). A mention in an answer becomes a link.
 */
export const ASK_SITE_PAGES: readonly AskSitePage[] = [
  { title: "Professions", path: "/wow-forever/professions", mentions: ["professions"] },
  { title: "Making gold", path: "/wow-forever/gold", mentions: ["making gold"] },
  { title: "Macros", path: "/wow-forever/macros", mentions: ["macros"] },
  { title: "Talents", path: "/wow-forever/talents", mentions: ["talents"] },
  { title: "Auction house prices", path: "/wow-forever/auction-house", mentions: ["auction house"] },
  { title: "Best gear", path: "/wow-forever/gear", mentions: ["best gear"] },
];

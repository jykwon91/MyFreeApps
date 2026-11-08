import { ASK_SITE_PAGES } from "@/games/wow-forever/data/ask/askSitePages";
import type { AskSitePage } from "@/games/wow-forever/types/ask/askSitePage";

/** The site pages an answer points to ("the site has a Professions page"), each once, in list order. */
export function sitePagesMentioned(answer: string): AskSitePage[] {
  const text = answer.toLowerCase();
  return ASK_SITE_PAGES.filter((page) => page.mentions.some((m) => new RegExp(`\\b${m}\\b`).test(text)));
}

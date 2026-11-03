import type { CookPage } from "../types/CookPage";

export function cookPageTitle(page: CookPage): string {
  if (page.kind === "step") return `Step ${page.number} of ${page.total}`;
  return page.kind === "ingredients" ? "Ingredients" : "All done";
}

export function cookPageAnnouncement(page: CookPage): string {
  return page.kind === "step" ? `${cookPageTitle(page)}. ${page.instruction}` : cookPageTitle(page);
}

export function cookNextLabel(page: CookPage, following: CookPage | undefined): string {
  if (page.kind === "done") return "Done";
  if (page.kind === "ingredients") return "Start cooking";
  return following?.kind === "done" ? "Finish" : "Next";
}

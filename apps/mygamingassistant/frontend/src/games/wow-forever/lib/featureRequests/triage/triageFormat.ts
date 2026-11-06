/** How triage values read on screen. */
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_BADGE_CAP, TRIAGE_COUNTER_SHOW_RATIO } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";

/** "3 ideas waiting for you" / "1 idea waiting for you". */
export function ideasWaitingLabel(count: number): string {
  return `${count} ${count === 1 ? "idea" : "ideas"} waiting for you`;
}

/** "Approved. 4 left." — read out after a card collapses. */
export function actionLeftLabel(verb: string, left: number): string {
  return `${verb}. ${left} left.`;
}

/** "2 new — Show". */
export function newArrivalsLabel(count: number): string {
  return `${count} new — Show`;
}

/** "Too many tries. Wait 42 seconds." */
export function waitSecondsLabel(seconds: number): string {
  return `Too many tries. Wait ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}

/** "Merge into 'Alchemy route'? Its 3 votes move too. This can't be undone." */
export function mergeQuestion(targetTitle: string, votes: number): string {
  return `Merge into '${targetTitle}'? Its ${votes} ${votes === 1 ? "vote moves" : "votes move"} too. ${TRIAGE_COPY.mergeCannotUndo}`;
}

/** "Merged into Alchemy route." */
export function mergedIntoLabel(targetTitle: string): string {
  return `Merged into ${targetTitle}.`;
}

/** "+2 merged". */
export function mergedCountLabel(count: number): string {
  return `+${count} merged`;
}

/** "Approved: Alchemy route" — the collapsed card / undo bar. */
export function doneLabel(verb: string, title: string): string {
  return `${verb}: ${title}`;
}

/** The tab badge: the count, "99+" above the cap. */
export function badgeCount(count: number): string {
  return count > TRIAGE_BADGE_CAP ? `${TRIAGE_BADGE_CAP}+` : String(count);
}

/** "P1". */
export function priorityLabel(priority: number): string {
  return `P${priority}`;
}

/** "12 / 80" once the field is TRIAGE_COUNTER_SHOW_RATIO full, else null. */
export function counterLabel(length: number, max: number): string | null {
  return length >= max * TRIAGE_COUNTER_SHOW_RATIO ? `${length} / ${max}` : null;
}

/** "1 change not saved" / "3 changes not saved". */
export function unsavedLabel(count: number): string {
  return count === 1 ? TRIAGE_COPY.unsavedOne : `${count} changes not saved`;
}

/** "Checked just now" / "Checked 3 min ago". */
export function checkedAgoLabel(checkedAt: number | undefined, now: number): string {
  if (checkedAt === undefined) return "";
  const minutes = Math.floor((now - checkedAt) / 60_000);
  return minutes < 1 ? "Checked just now" : `Checked ${minutes} min ago`;
}

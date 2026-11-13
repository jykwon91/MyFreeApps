import { MAIN_LANDMARK_POLL_INTERVAL_MS } from "./constants/mainLandmarkPollInterval";
import { MAIN_LANDMARK_SETTLE_TIMEOUT_MS } from "./constants/mainLandmarkSettleTimeout";
import { MAIN_LANDMARK_STEADY_MS } from "./constants/mainLandmarkSteady";
import { isAppPage } from "./isAppPage";
import type { MainLandmarkPage } from "./types/MainLandmarkPage";
import type { MainLandmarkReading } from "./types/MainLandmarkReading";
import { valueWithin } from "./valueWithin";

/**
 * Counts the page's main landmarks, again every MAIN_LANDMARK_POLL_INTERVAL_MS,
 * until there is exactly one, a wrong count has held for MAIN_LANDMARK_STEADY_MS,
 * or MAIN_LANDMARK_SETTLE_TIMEOUT_MS has passed, and returns the last count it
 * got (null if it never got one). Hidden ones count too: a modal dialog hides
 * the rest of the page from the accessibility tree (aria-hidden), main
 * included, while it is open.
 *
 * A page that is closed or off the app's origin, before or during the count
 * (a popup that closes itself, a redirect to a sign-in provider), is skipped:
 * there is no app page left to check. Every wait is bounded, so a page that
 * stops answering can't hang the teardown.
 */
export async function countMainLandmarks(page: MainLandmarkPage, baseURL: string | undefined): Promise<MainLandmarkReading> {
  const deadline = Date.now() + MAIN_LANDMARK_SETTLE_TIMEOUT_MS;
  const mains = page.getByRole("main", { includeHidden: true });
  const onAppPage = () => !page.isClosed() && isAppPage(page.url(), baseURL);
  let count: number | null = null;
  let steadySince = Date.now();
  while (onAppPage()) {
    const read = await valueWithin(mains.count(), Math.max(0, deadline - Date.now()));
    if (!onAppPage()) break;
    if (read !== count) steadySince = Date.now();
    count = read ?? count;
    const steady = count !== null && Date.now() - steadySince >= MAIN_LANDMARK_STEADY_MS;
    if (count === 1 || steady || Date.now() >= deadline) return { kind: "counted", url: page.url(), count };
    await new Promise((resolve) => setTimeout(resolve, MAIN_LANDMARK_POLL_INTERVAL_MS));
  }
  return { kind: "skipped", url: page.url() };
}

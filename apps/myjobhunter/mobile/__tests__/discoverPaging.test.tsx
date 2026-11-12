import { DISCOVERED_JOBS_PAGE_SIZE } from "@myjobhunter/api-client/constants/discoverPaging";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import { PAGED_LIST_MESSAGES as PAGED } from "../src/constants/pagedListMessages";
import { store } from "../src/lib/store";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverPage, discoverRoutes, jobsFor } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
// A short page keeps every card inside the list's first render window.
jest.mock("@myjobhunter/api-client/constants/discoverPaging", () => ({ DISCOVERED_JOBS_PAGE_SIZE: 3, FIRST_DISCOVERED_JOBS_OFFSET: 0 }));

const SOURCE = discoverySourceRecord({ id: "src-1", name: "Backend roles" });
const COUNT = DISCOVERED_JOBS_PAGE_SIZE + 2;
const MANY: readonly DiscoveredJob[] = Array.from({ length: COUNT }, (_, index) => discoveredJobRecord({ id: `j${index}`, title: `Posting ${index}` }));
const cards = (): number => screen.queryAllByTestId(/^discovered-job-j\d+$/).length;
const pageRequests = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /discover").map(({ params }) => [params.offset, params.limit]);

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  store.dispatch(baseApi.util.resetApiState());
});

it("shows the first page and the count, then the rest of the inbox on Show more", async () => {
  const sent = serve(discoverRoutes([SOURCE], MANY));
  await renderDiscover();

  expect(await screen.findByText(PAGED.showingCount(DISCOVERED_JOBS_PAGE_SIZE, COUNT))).toBeTruthy();
  expect(cards()).toBe(DISCOVERED_JOBS_PAGE_SIZE);

  await fireEvent.press(screen.getByRole("button", { name: PAGED.loadMore }));

  expect(await screen.findByTestId(`discovered-job-j${COUNT - 1}`)).toBeTruthy();
  expect(cards()).toBe(COUNT);
  expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
  expect(pageRequests(sent)).toEqual([
    [0, DISCOVERED_JOBS_PAGE_SIZE],
    [DISCOVERED_JOBS_PAGE_SIZE, DISCOVERED_JOBS_PAGE_SIZE],
  ]);
});

it("pages the Saved view too, past what used to be its first page", async () => {
  const saved = MANY.map((job) => ({ ...job, saved_at: "2026-11-10T00:00:00Z" }));
  serve(discoverRoutes([SOURCE], saved));
  await renderDiscover();
  await fireEvent.press(await screen.findByRole("tab", { name: "Saved" }));

  expect(await screen.findByText(PAGED.showingCount(DISCOVERED_JOBS_PAGE_SIZE, COUNT))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: PAGED.loadMore }));

  expect(await screen.findByTestId(`discovered-job-j${COUNT - 1}`)).toBeTruthy();
  expect(within(screen.getByTestId(`discovered-job-j${COUNT - 1}`)).getByText(JOB.saved)).toBeTruthy();
});

it("keeps the cards and offers Try again when the next page fails", async () => {
  let failNextPage = true;
  serve({
    ...discoverRoutes([SOURCE], MANY),
    "GET /discover": (_body, params) => (Number(params.offset) > 0 && failNextPage ? { status: 503 } : discoverPage(jobsFor(MANY, params), params)),
  });
  await renderDiscover();
  await screen.findByText(PAGED.showingCount(DISCOVERED_JOBS_PAGE_SIZE, COUNT));

  await fireEvent.press(screen.getByRole("button", { name: PAGED.loadMore }));
  expect(await screen.findByText(PAGED.couldntLoadMore)).toBeTruthy();
  expect(cards()).toBe(DISCOVERED_JOBS_PAGE_SIZE);

  failNextPage = false;
  await fireEvent.press(screen.getByRole("button", { name: PAGED.tryAgain }));
  await waitFor(() => expect(cards()).toBe(COUNT));
});

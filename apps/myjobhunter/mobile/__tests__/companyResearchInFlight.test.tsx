/**
 * A company's research is run once: going back and reopening the company mid-run shows the run
 * still going (no Run research to start a second, paid run), and a run the server refuses because
 * it's already running (from another device or tab) says so, with Try again.
 */
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../src/constants/companyResearch";
import { store } from "../src/lib/store";
import { companyDetailRoutes } from "../test-support/companyDetailRoutes";
import { companyRecord } from "../test-support/companyRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderCompanyDetail } from "../test-support/renderCompanyDetail";
import { researchRecord } from "../test-support/researchRecord";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-router", () => jest.requireActual("../test-support/mockExpoRouter").mockExpoRouter);

const ID = "c-acme";
const ACME = companyRecord({ id: ID, name: "Acme Corp" });
const FULL = researchRecord({ company_id: ID, overall_sentiment: "positive" });

const runs = (sent: SentRequest[]) => sent.filter(({ route }) => route === `POST /companies/${ID}/research`);
const research = () => within(screen.getByTestId("company-research"));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

it("shows the run still going after going back and reopening the company, and runs it once", async () => {
  let researched = false;
  let answer: () => void = () => undefined;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => (researched ? { status: 200, data: FULL } : { status: 404, data: { detail: "No research" } }),
    [`POST /companies/${ID}/research`]: () =>
      new Promise<FakeReply>(
        (resolve) =>
          (answer = () => {
            researched = true;
            resolve({ status: 200, data: FULL });
          }),
      ),
  });
  await renderCompanyDetail(ID);
  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  expect(runs(sent)).toHaveLength(1);

  // Back, then into the company again, while the run is in flight.
  await act(async () => screen.unmount());
  await renderCompanyDetail(ID);
  expect(await research().findByText(MESSAGES.runningNote("Acme Corp"))).toBeTruthy();
  expect(research().getByRole("button", { name: MESSAGES.running }).props.accessibilityState).toEqual(
    expect.objectContaining({ busy: true }),
  );
  expect(research().queryByRole("button", { name: MESSAGES.run })).toBeNull();

  await act(async () => answer());
  expect(await research().findByText("Positive")).toBeTruthy();
  expect(runs(sent)).toHaveLength(1);
});

it("says the research is already running when the server refuses a second run, and runs again on Try again", async () => {
  let running = true;
  let researched = false;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => (researched ? { status: 200, data: FULL } : { status: 404 }),
    [`POST /companies/${ID}/research`]: () => {
      if (running) return { status: 409, data: { detail: "Research for this company is already running" } };
      researched = true;
      return { status: 200, data: FULL };
    },
  });
  await renderCompanyDetail(ID);

  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  // In a toast, and where the research would be.
  await waitFor(() => expect(screen.getAllByText(COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE)).toHaveLength(2));
  expect(research().queryByText("Research for this company is already running")).toBeNull();

  running = false;
  await fireEvent.press(research().getByRole("button", { name: MESSAGES.tryAgain }));
  expect(await research().findByText("Positive")).toBeTruthy();
  expect(runs(sent)).toHaveLength(2);
});

it("doesn't show a failed run again after going back and reopening the company", async () => {
  serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => ({ status: 404, data: { detail: "No research" } }),
    [`POST /companies/${ID}/research`]: () => ({ status: 502, data: { detail: "AI synthesis failed" } }),
  });
  await renderCompanyDetail(ID);
  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  expect(await research().findByRole("button", { name: MESSAGES.tryAgain })).toBeTruthy();

  await act(async () => screen.unmount());
  await renderCompanyDetail(ID);
  expect(await research().findByRole("button", { name: MESSAGES.run })).toBeTruthy();
  expect(research().queryByRole("button", { name: MESSAGES.tryAgain })).toBeNull();
});

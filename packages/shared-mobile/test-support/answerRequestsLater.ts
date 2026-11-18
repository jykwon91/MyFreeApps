import { FAKE_ANSWER_DELAY_MS } from "./fakeAnswerDelay";

// Waits on whichever clock the test is running on, looked up when the answer is sent. On a fake
// clock the answer comes once the test moves time on, as findBy and waitFor do, and the run of
// pending timers after each test delivers any answer still on its way before the next test.
function mockAnswerLater(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, FAKE_ANSWER_DELAY_MS));
}

// Every fake server answers through the api's adapter, so delaying its responses here delays them
// all. Installed when the api is first loaded, so the module order a test file relies on is kept.
jest.mock("@platform/core/lib/api", () => {
  const actual = jest.requireActual<typeof import("@platform/core/lib/api")>("@platform/core/lib/api");
  actual.default.interceptors.response.use(
    async (response) => {
      await mockAnswerLater();
      return response;
    },
    async (error: unknown) => {
      await mockAnswerLater();
      throw error;
    },
  );
  return actual;
});

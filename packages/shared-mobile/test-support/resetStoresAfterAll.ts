import { resetApiStateAfterAll } from "./resetApiStateAfterAll";

// Hands the real baseApi back once its stores can be tracked. Importing it here would load axios
// before a test's own setup, such as the FormData it swaps in, runs.
jest.mock("@platform/core/store/baseApi", () => {
  const actual = jest.requireActual<typeof import("@platform/core/store/baseApi")>("@platform/core/store/baseApi");
  const { trackApiStores } = jest.requireActual<typeof import("./resetApiStateAfterAll")>("./resetApiStateAfterAll");
  trackApiStores([actual.baseApi]);
  return actual;
});

resetApiStateAfterAll();

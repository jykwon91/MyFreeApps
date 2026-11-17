import { SessionProvider, ToastProvider, type MobileSession, type SessionState } from "@platform/mobile";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import { act, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { DRAFT_DISCARD_COPY } from "../src/constants/newRecipe";
import NewRecipeForm from "../src/features/newRecipe/NewRecipeForm";
import { makeStore } from "../src/lib/store";
import type { DraftOrigin } from "../src/types/DraftOrigin";

const mockRepeat = jest.fn();
const mockGuard: { prevent: boolean; ask: ((event: { repeat: () => void }) => void) | null } = { prevent: false, ask: null };
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  usePreventRemove: (prevent: boolean, ask: (event: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent;
    mockGuard.ask = ask;
  },
}));
jest.mock("@platform/core/utils/localeDecimalSeparator", () => ({ localeDecimalSeparator: () => "." }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const DRAFT: RecipeExtractionDraft = {
  title: "Tomato soup",
  description: "",
  source: "",
  servings: "4",
  prep_minutes: null,
  cook_minutes: null,
  ingredients: [{ name: "tomatoes", quantity: "2", unit: "", note: "" }],
  steps: [{ instruction: "Simmer." }],
} as unknown as RecipeExtractionDraft;

const SESSION = {
  start: async () => {},
  getState: (): SessionState => ({ status: "signedIn", email: "sam@example.com", sessionId: "s1" }),
  subscribe: () => () => {},
} as unknown as MobileSession;

async function showSeeded(origin: DraftOrigin) {
  await render(
    <Provider store={makeStore()}>
      <SessionProvider session={SESSION}>
        <ToastProvider bottomOffset={0}>
          <NewRecipeForm seed={{ draft: DRAFT, origin }} />
        </ToastProvider>
      </SessionProvider>
    </Provider>,
  );
}

beforeEach(() => {
  mockGuard.prevent = false;
  mockGuard.ask = null;
});

afterEach(() => jest.clearAllMocks());

describe("leaving an untouched draft", () => {
  it("asks for a photo's, which would need reading again", async () => {
    await showSeeded("photo");
    expect(mockGuard.prevent).toBe(true);
    await act(async () => mockGuard.ask?.({ repeat: mockRepeat }));
    const copy = DRAFT_DISCARD_COPY.photo;
    expect(alert).toHaveBeenCalledWith(copy.discardTitle, copy.discardBody, expect.any(Array));
  });

  it("doesn't ask for a discovered recipe, which can be opened again", async () => {
    await showSeeded("discover");
    expect(mockGuard.prevent).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });
});

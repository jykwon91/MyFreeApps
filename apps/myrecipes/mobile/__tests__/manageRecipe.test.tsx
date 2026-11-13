import { RECIPE_FORM_PROBLEMS as PROBLEMS, RECIPE_TITLE_MAX_LENGTH } from "@myrecipes/api-client/constants/recipeForm";
import { RECIPE_MANAGE_MESSAGES as SHARED } from "@myrecipes/api-client/constants/recipeManage";
import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { baseApi } from "@platform/core/store/baseApi";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { ToastProvider } from "@platform/mobile";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { serve } from "@platform/mobile/test-support/fakeServer";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Alert } from "react-native";
import { Provider } from "react-redux";
import { MANAGE_RECIPE_MESSAGES as MESSAGES } from "../src/constants/manageRecipe";
import { RECIPES_LIST_PATH } from "../src/constants/routes";
import RecipeDetailScreen from "../src/features/recipes/RecipeDetailScreen";
import { makeStore } from "../src/lib/store";

const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  router: { dismissTo: (href: string) => mockDismissTo(href) },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ id: "r1" }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const SOUP: RecipeDetailResponse = {
  id: "r1",
  title: "Tomato soup",
  description: "A weeknight soup.",
  source: "Grandma",
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  version_count: 1,
  latest_version_number: 1,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: {
    id: "v1",
    recipe_id: "r1",
    version_number: 1,
    parent_version_id: null,
    change_note: null,
    servings: "4",
    prep_minutes: 10,
    cook_minutes: 20,
    created_at: "2026-11-11T00:00:00Z",
    ingredients: [{ id: "i1", lineage_key: "lk-1", position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: null }],
    steps: [{ id: "s1", position: 0, instruction: "Simmer." }],
  },
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

let sent: SentRequest[];
let store: ReturnType<typeof makeStore>;

const patches = () => sent.filter(({ route }) => route === "PATCH /recipes/r1");
const deletes = () => sent.filter(({ route }) => route === "DELETE /recipes/r1");

/** Answers once, when the test says so. */
function held() {
  let answer: (value: FakeReply) => void = () => undefined;
  return {
    route: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    answer: async (value: FakeReply) => act(async () => answer(value)),
  };
}

async function show(recipe: RecipeDetailResponse = SOUP, routes: Parameters<typeof serve>[0] = {}) {
  sent = serve({ "GET /recipes/r1": () => reply(200, recipe), "GET /recipes": () => reply(200, []), ...routes });
  store = makeStore();
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <RecipeDetailScreen />
      </ToastProvider>
    </Provider>,
  );
  await screen.findByText("Simmer.");
}

async function openEdit() {
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.edit }));
  expect(screen.getByRole("header", { name: SHARED.editTitle })).toBeTruthy();
}

const titleField = () => screen.getByLabelText("Title, required");
const saveButton = () => screen.getByRole("button", { name: MESSAGES.save });

beforeEach(() => {
  alert.mockClear();
  mockDismissTo.mockClear();
});

afterEach(async () => {
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("who can manage a recipe", () => {
  it("offers its owner Edit details and Delete recipe, each a full-size button with a hint", async () => {
    await show();

    const edit = screen.getByRole("button", { name: MESSAGES.edit });
    const remove = screen.getByRole("button", { name: SHARED.deleteConfirm });
    expect(edit.props.accessibilityHint).toBe(MESSAGES.editHint);
    expect(remove.props.accessibilityHint).toBe(MESSAGES.deleteHint);
  });

  it("offers neither to someone else", async () => {
    await show({ ...SOUP, is_owner: false });

    expect(screen.queryByRole("button", { name: MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: SHARED.deleteConfirm })).toBeNull();
  });

  it("offers them on a recipe with no version yet", async () => {
    sent = serve({ "GET /recipes/r1": () => reply(200, { ...SOUP, latest_version: null }) });
    store = makeStore();
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <RecipeDetailScreen />
        </ToastProvider>
      </Provider>,
    );

    expect(await screen.findByRole("button", { name: MESSAGES.edit })).toBeTruthy();
    expect(screen.getByRole("button", { name: SHARED.deleteConfirm })).toBeTruthy();
  });
});

describe("editing a recipe's details", () => {
  it("starts from what's saved, sends the website's trimmed body, says so and shows the new title", async () => {
    const saved = { ...SOUP, title: "Roast tomato soup", description: null, source: "Gran" };
    let current = SOUP;
    await show(SOUP, {
      "GET /recipes/r1": () => reply(200, current),
      "PATCH /recipes/r1": () => {
        current = saved;
        return reply(200, saved);
      },
    });
    await openEdit();

    expect(titleField().props.value).toBe("Tomato soup");
    expect(screen.getByLabelText("Description").props.value).toBe("A weeknight soup.");
    expect(screen.getByLabelText("Source").props.value).toBe("Grandma");

    await fireEvent.changeText(titleField(), "  Roast tomato soup ");
    await fireEvent.changeText(screen.getByLabelText("Description"), "   ");
    await fireEvent.changeText(screen.getByLabelText("Source"), "Gran");
    await fireEvent.press(saveButton());

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ title: "Roast tomato soup", description: null, source: "Gran" });
    expect(await screen.findByRole("alert", { name: SHARED.updated })).toBeTruthy();
    expect(screen.queryByRole("header", { name: SHARED.editTitle })).toBeNull();
    expect(screen.getByRole("header", { name: "Roast tomato soup" })).toBeTruthy();
  });

  it("shows the save in flight on its button, and holds both buttons and the fields", async () => {
    const patch = held();
    await show(SOUP, { "PATCH /recipes/r1": patch.route });
    await openEdit();
    await fireEvent.press(saveButton());

    const busy = screen.getByRole("button", { name: MESSAGES.saving });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByRole("button", { name: MESSAGES.cancel }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(titleField().props.editable).toBe(false);

    await fireEvent.press(busy);
    expect(patches()).toHaveLength(1);
    await patch.answer(reply(200, SOUP));
  });

  it("won't save without a title, and says why", async () => {
    await show(SOUP, { "PATCH /recipes/r1": () => reply(200, SOUP) });
    await openEdit();
    await fireEvent.changeText(titleField(), "   ");
    expect(screen.queryByText(PROBLEMS.titleRequired)).toBeNull();

    await fireEvent.press(saveButton());

    expect(screen.getByText(PROBLEMS.titleRequired)).toBeTruthy();
    expect(titleField().props.accessibilityHint).toBe(PROBLEMS.titleRequired);
    expect(patches()).toHaveLength(0);
  });

  it("says a title is too long as it's typed, and won't save it", async () => {
    const long = "t".repeat(RECIPE_TITLE_MAX_LENGTH + 1);
    await show(SOUP, { "PATCH /recipes/r1": () => reply(200, SOUP) });
    await openEdit();
    await fireEvent.changeText(titleField(), long);

    const problem = tooLongProblem(long, RECIPE_TITLE_MAX_LENGTH) ?? "";
    expect(screen.getByText(problem)).toBeTruthy();
    await fireEvent.press(saveButton());
    expect(patches()).toHaveLength(0);
  });

  it("keeps what was typed when the save fails, says so in the sheet, and can try again", async () => {
    let fail = true;
    await show(SOUP, { "PATCH /recipes/r1": () => (fail ? reply(500) : reply(200, { ...SOUP, title: "Better soup" })) });
    await openEdit();
    await fireEvent.changeText(titleField(), "Better soup");
    await fireEvent.press(saveButton());

    expect(await screen.findByRole("alert", { name: SHARED.couldntUpdate })).toBeTruthy();
    expect(titleField().props.value).toBe("Better soup");
    expect(saveButton().props.accessibilityState).toMatchObject({ disabled: false });

    fail = false;
    await fireEvent.press(saveButton());
    expect(await screen.findByRole("alert", { name: SHARED.updated })).toBeTruthy();
    expect(patches()).toHaveLength(2);
  });

  it("closes on Cancel without saving", async () => {
    await show();
    await openEdit();
    await fireEvent.changeText(titleField(), "Something else");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));

    expect(screen.queryByRole("header", { name: SHARED.editTitle })).toBeNull();
    expect(patches()).toHaveLength(0);
    expect(screen.getByRole("header", { name: "Tomato soup" })).toBeTruthy();
  });
});

describe("deleting a recipe", () => {
  async function pressDelete() {
    await fireEvent.press(screen.getByRole("button", { name: SHARED.deleteConfirm }));
  }

  it("asks first, as the website does, and Cancel deletes nothing", async () => {
    await show(SOUP, { "DELETE /recipes/r1": () => reply(204) });
    await pressDelete();

    expect(alert).toHaveBeenCalledWith(SHARED.deleteTitle, SHARED.deleteBody, [
      { text: MESSAGES.cancel, style: "cancel" },
      { text: SHARED.deleteConfirm, style: "destructive", onPress: expect.any(Function) },
    ]);
    expect(alertButton(MESSAGES.cancel).onPress).toBeUndefined();
    expect(deletes()).toHaveLength(0);
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("deletes on confirm, shows it on the button, says so, goes back to the list, and refreshes the list", async () => {
    const remove = held();
    await show(SOUP, { "DELETE /recipes/r1": remove.route });
    const list = store.dispatch(recipesApi.endpoints.listRecipes.initiate());
    await act(async () => {
      await list;
    });
    const listLoads = () => sent.filter(({ route }) => route === "GET /recipes").length;
    const loadsBefore = listLoads();

    await pressDelete();
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());
    expect(screen.getByRole("button", { name: MESSAGES.deleting }).props.accessibilityState).toMatchObject({ busy: true });
    expect(deletes()).toHaveLength(1);

    await remove.answer(reply(204, null));
    expect(await screen.findByRole("alert", { name: SHARED.deleted })).toBeTruthy();
    expect(mockDismissTo).toHaveBeenCalledWith(RECIPES_LIST_PATH);
    await waitFor(() => expect(listLoads()).toBe(loadsBefore + 1));
    list.unsubscribe();
  });

  it("goes back to the list when it was already deleted", async () => {
    await show(SOUP, { "DELETE /recipes/r1": () => reply(404, { detail: "Not Found" }) });
    await pressDelete();
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());

    expect(await screen.findByRole("alert", { name: MESSAGES.gone })).toBeTruthy();
    expect(mockDismissTo).toHaveBeenCalledWith(RECIPES_LIST_PATH);
  });

  it.each([
    ["deleted", () => reply(204, null)],
    ["already deleted", () => reply(404, { detail: "Not Found" })],
  ])("never says the recipe is not found while it leaves after it was %s", async (_name, answer) => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    let deleted = false;
    await show(SOUP, {
      "GET /recipes/r1": () => (deleted ? reply(404, { detail: "Not Found" }) : reply(200, SOUP)),
      "DELETE /recipes/r1": () => {
        deleted = true;
        return answer();
      },
    });
    await pressDelete();
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith(RECIPES_LIST_PATH));
    await waitFor(() => expect(sent.filter(({ route }) => route === "GET /recipes/r1").length).toBeGreaterThan(1));
    await act(async () => undefined);
    expect(screen.queryByText("Recipe not found")).toBeNull();
    expect(screen.getByText("Simmer.")).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith("Recipe not found");
    announce.mockRestore();
  });

  it("stays and says so when the delete fails, and can try again", async () => {
    await show(SOUP, { "DELETE /recipes/r1": () => reply(500) });
    await pressDelete();
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());

    expect(await screen.findByRole("alert", { name: SHARED.couldntDelete })).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: SHARED.deleteConfirm });
    expect(button.props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  });
});

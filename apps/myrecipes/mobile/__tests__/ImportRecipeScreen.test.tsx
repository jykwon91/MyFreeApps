import "@platform/mobile/test-support/reactNativeFormData";
import { PHOTO_IMPORT_COPY } from "@myrecipes/api-client/constants/photoImport";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import { type MobileSession, type SessionState, SessionProvider, ToastProvider } from "@platform/mobile";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { serve } from "@platform/mobile/test-support/fakeServer";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { ImageManipulator } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { IMPORT_RECIPE_MESSAGES as MESSAGES } from "../src/constants/importRecipe";
import { DRAFT_FILLED_IN, DRAFT_NEEDS_REVIEW, NEW_RECIPE_MESSAGES } from "../src/constants/newRecipe";
import ImportRecipeScreen from "../src/features/importRecipe/ImportRecipeScreen";
import { usePhotoImport } from "../src/features/importRecipe/usePhotoImport";
import { makeStore } from "../src/lib/store";
import RecipesHeaderActions from "../src/features/recipes/RecipesHeaderActions";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRepeat = jest.fn();
// What the screen last told the navigator about leaving: whether to stop it, and what to do instead.
const mockGuard: { prevent: boolean; ask: ((event: { repeat: () => void }) => void) | null } = { prevent: false, ask: null };
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePreventRemove: (prevent: boolean, ask: (event: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent;
    mockGuard.ask = ask;
  },
}));
jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));
jest.mock("../src/utils/deviceDecimalSeparator", () => ({ deviceDecimalSeparator: () => "." }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => mockKeepAwake() }));
const mockKeepAwake = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
const mockContext = { resize: jest.fn(), renderAsync: jest.fn(), release: jest.fn() };
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
const picker = jest.mocked(ImagePicker);

const PICKED = "cache:/ImagePicker/IMG_0001.HEIC";
const PREPARED = "cache:/ImageManipulator/out.jpg";

const DRAFT: RecipeExtractionDraft = {
  title: "Grandma's tomato soup",
  description: "From the stained card.",
  source: "Grandma's recipe box",
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  ingredients: [{ name: "tomatoes", quantity: 2, unit: "cans", note: "crushed" }],
  steps: [{ instruction: "Simmer." }],
};

const CREATED = {
  id: "r-new",
  title: DRAFT.title,
  description: DRAFT.description,
  source: DRAFT.source,
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  version_count: 1,
  latest_version_number: 1,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: null,
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

/** Extractions answered one by one, in the order they were asked for. */
function heldExtractions() {
  const answers: ((value: FakeReply) => void)[] = [];
  return {
    route: () => new Promise<FakeReply>((resolve) => answers.push(resolve)),
    answer: async (index: number, value: FakeReply) => act(async () => answers[index](value)),
    count: () => answers.length,
  };
}

/** A session whose account the test can change, as signing out and in again does. */
function fakeSession(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const session = {
    start: async () => {},
    retryRestore: async () => {},
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as MobileSession;
  const become = async (next: SessionState) =>
    act(async () => {
      state = next;
      listeners.forEach((listener) => listener());
    });
  return { session, become };
}

const SAM: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };
const ALEX: SessionState = { status: "signedIn", email: "alex@example.com", sessionId: "s2" };

let sent: SentRequest[];
let store: ReturnType<typeof makeStore>;

async function show(state: SessionState = SAM) {
  const { session, become } = fakeSession(state);
  store = makeStore();
  await render(
    <Provider store={store}>
      <SessionProvider session={session}>
        <ToastProvider bottomOffset={0}>
          <ImportRecipeScreen />
        </ToastProvider>
      </SessionProvider>
    </Provider>,
  );
  return become;
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole("button", { name }));
}

/** Back, or a swipe: what the navigator does with the screen's guard. */
async function tryToLeave() {
  await act(async () => {
    if (mockGuard.prevent && mockGuard.ask) mockGuard.ask({ repeat: mockRepeat });
    else mockRepeat();
  });
}

function pickerResult(uri = PICKED): ImagePicker.ImagePickerResult {
  return { canceled: false, assets: [{ uri }] } as unknown as ImagePicker.ImagePickerResult;
}

function pickerGives(uri = PICKED) {
  picker.launchCameraAsync.mockResolvedValue(pickerResult(uri));
  picker.launchImageLibraryAsync.mockResolvedValue(pickerResult(uri));
}

/** Picking puts the picker's copy on disk; re-encoding writes the JPEG that's sent. */
function photoOnDisk() {
  resetFakeFiles([PICKED]);
  mockContext.renderAsync.mockResolvedValue({
    saveAsync: async () => {
      resetFakeFiles([...fakeFiles(), PREPARED]);
      return { uri: PREPARED };
    },
    release: jest.fn(),
  });
}

function extractions(): SentRequest[] {
  return sent.filter((request) => request.route === "POST /recipes/extract");
}

/** The flow on its own, so a test can tap twice before anything re-renders, as a quick finger can. */
async function renderPhotoImport() {
  store = makeStore();
  return renderHook(() => usePhotoImport(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
}

/** Extractions the screen called off, as the store records them. */
function abortedExtractions(): number {
  return Object.values(store.getState().api.mutations).filter(
    (mutation) => mutation?.endpointName === "extractRecipeFromPhoto" && mutation.error?.name === "AbortError",
  ).length;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard.prevent = false;
  mockGuard.ask = null;
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(mockContext as never);
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
  pickerGives();
  photoOnDisk();
  sent = serve({ "POST /recipes/extract": () => reply(200, DRAFT), "POST /recipes": () => reply(201, CREATED) });
});

describe("signed out", () => {
  it("asks to sign in, as the website does, and opens no picker", async () => {
    await show({ status: "signedOut", endedByServer: false, lastEmail: null });
    expect(screen.getByRole("header", { name: MESSAGES.signInHeading })).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.takePhoto })).toBeNull();
    await press(NEW_RECIPE_MESSAGES.signIn);
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
  });

  it("waits on a skeleton while it reads the stored session", async () => {
    await show({ status: "restoring" });
    expect(screen.queryByText(MESSAGES.signInHeading)).toBeNull();
    expect(screen.getByTestId("import-recipe-skeleton", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("getting here", () => {
  it("sits beside New in the Recipes header, as the website's Import from photo button does", async () => {
    await render(<RecipesHeaderActions />);
    await press(PHOTO_IMPORT_COPY.title);
    expect(mockPush).toHaveBeenCalledWith("/recipes/import");
    await press(NEW_RECIPE_MESSAGES.newRecipe);
    expect(mockPush).toHaveBeenLastCalledWith("/recipes/new");
  });

  it("offers typing it in instead", async () => {
    await show();
    await press(MESSAGES.typeItIn);
    expect(mockReplace).toHaveBeenCalledWith("/recipes/new");
  });
});

describe("taking or choosing a photo", () => {
  it("takes one photo, shrinks it to what the backend reads, and drops the picker's copy", async () => {
    await show();
    await press(MESSAGES.takePhoto);

    expect(await screen.findByLabelText(MESSAGES.previewLabel)).toBeTruthy();
    expect(picker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ["images"], exif: false });
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith(PICKED, { maxWidth: 1568, maxHeight: 1568 });
    expect(mockContext.resize).not.toHaveBeenCalled();
    expect(fakeFiles()).toEqual([PREPARED]);
    expect(extractions()).toHaveLength(0);
  });

  it("says when camera access was refused, and offers Settings", async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await show();
    await press(MESSAGES.takePhoto);

    expect(await screen.findByText(MESSAGES.cameraDenied)).toBeTruthy();
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    await press(MESSAGES.openSettings);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("stays put when the picker is closed, and says when a photo can't be opened", async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await show();
    await press(MESSAGES.choosePhoto);
    await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: MESSAGES.takePhoto })).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.previewLabel)).toBeNull();

    mockContext.renderAsync.mockRejectedValueOnce(new Error("not an image"));
    await press(MESSAGES.choosePhoto);
    expect(await screen.findByText(MESSAGES.photoUnreadable)).toBeTruthy();
    // The picker's copy goes even then.
    expect(fakeFiles()).toEqual([]);
  });

  it("drops the photo picked after the screen was left", async () => {
    let finishPicking: (result: ImagePicker.ImagePickerResult) => void = () => undefined;
    picker.launchImageLibraryAsync.mockReturnValueOnce(new Promise((resolve) => (finishPicking = resolve)));
    await show();
    await press(MESSAGES.choosePhoto);
    await screen.unmount();

    await act(async () => finishPicking(pickerResult()));
    // Neither the picker's copy nor the JPEG made from it is left behind.
    await waitFor(() => expect(fakeFiles()).toEqual([]));
    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(1);
  });

  it("can swap the photo before it's read", async () => {
    await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.chooseDifferent);
    expect(fakeFiles()).toEqual([]);
    expect(screen.getByRole("button", { name: MESSAGES.takePhoto })).toBeTruthy();
  });
});

describe("reading the photo", () => {
  it("sends the photo, waits with the screen awake, then fills the form in to review and create", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route, "POST /recipes": () => reply(201, CREATED) });
    await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);

    expect(screen.getByText(PHOTO_IMPORT_COPY.reading)).toBeTruthy();
    expect(screen.queryByText(PHOTO_IMPORT_COPY.timeHint)).toBeNull();
    expect(mockKeepAwake).toHaveBeenCalled();
    const [request] = extractions();
    const parts = (request.data as { getParts: () => { uri: string; name: string; type: string; fieldName: string }[] }).getParts();
    expect(parts).toEqual([expect.objectContaining({ fieldName: "file", uri: PREPARED, name: "recipe.jpg", type: "image/jpeg" })]);

    // Leaving asks first, as the website warns before a tab close.
    await tryToLeave();
    expect(alert).toHaveBeenCalledWith(MESSAGES.stopTitle, MESSAGES.stopBody, expect.any(Array));
    expect(mockRepeat).not.toHaveBeenCalled();
    expect(alertButton(MESSAGES.keepWaiting).style).toBe("cancel");

    await held.answer(0, reply(200, DRAFT));

    expect(await screen.findByText(DRAFT_FILLED_IN.photo as string)).toBeTruthy();
    expect(screen.getByLabelText("Title, required").props.value).toBe(DRAFT.title);
    expect(screen.getByLabelText("Source").props.value).toBe(DRAFT.source);
    expect(screen.getByLabelText("Ingredient 1").props.value).toBe("tomatoes");
    expect(screen.getByLabelText("Ingredient 1 amount").props.value).toBe("2");
    expect(screen.getByLabelText("Step 1").props.value).toBe("Simmer.");
    expect(fakeFiles()).toEqual([]);
    // Nothing's changed yet, so leaving needn't ask.
    expect(mockGuard.prevent).toBe(false);

    await press(NEW_RECIPE_MESSAGES.create);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/recipes/[id]",
        params: { id: "r-new", title: DRAFT.title, owner: "Sam" },
      }),
    );
    const created = sent.find((candidate) => candidate.route === "POST /recipes");
    expect(created?.body).toMatchObject({ title: DRAFT.title, source: DRAFT.source, prep_minutes: 10, cook_minutes: 25 });
  });

  it("shows how long it takes once it's been a while", async () => {
    jest.useFakeTimers();
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);
    expect(screen.queryByText(PHOTO_IMPORT_COPY.timeHint)).toBeNull();
    await act(async () => jest.advanceTimersByTime(6000));
    expect(screen.getByText(PHOTO_IMPORT_COPY.timeHint)).toBeTruthy();
    await held.answer(0, reply(200, DRAFT));
    jest.useRealTimers();
  });

  it("asks for a check when little could be read", async () => {
    sent = serve({ "POST /recipes/extract": () => reply(200, { ...DRAFT, title: "", steps: [] }) });
    await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);
    expect(await screen.findByText(DRAFT_NEEDS_REVIEW.photo)).toBeTruthy();
    expect(screen.queryByText(DRAFT_FILLED_IN.photo as string)).toBeNull();
  });

  it.each([
    [422, /clearer or better-lit photo/],
    [429, /Give it a few minutes/],
    [503, /isn't available right now/],
  ])("keeps the photo after a %i and says why, so it can be tried again", async (status, message) => {
    let calls = 0;
    sent = serve({ "POST /recipes/extract": () => ((calls += 1) === 1 ? reply(status, { detail: "no" }) : reply(200, DRAFT)) });
    await show();
    await press(MESSAGES.takePhoto);
    await press(MESSAGES.extract);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.previewLabel)).toBeTruthy();
    expect(mockGuard.prevent).toBe(false);

    await press(MESSAGES.extract);
    expect(await screen.findByLabelText("Title, required")).toBeTruthy();
    expect(extractions()).toHaveLength(2);
    expect(picker.launchCameraAsync).toHaveBeenCalledTimes(1);
  });

  it("drops a read when the screen is left, even one that answers later", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);
    await tryToLeave();
    await act(async () => alertButton(MESSAGES.leave).onPress?.());
    expect(mockRepeat).toHaveBeenCalledTimes(1);

    await screen.unmount();
    expect(fakeFiles()).toEqual([]);
    await held.answer(0, reply(200, DRAFT));
  });
});

describe("another account", () => {
  it("starts over, and the last account's read doesn't land in it", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    const become = await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);
    expect(screen.getByText(PHOTO_IMPORT_COPY.reading)).toBeTruthy();

    await become(ALEX);
    expect(screen.queryByText(PHOTO_IMPORT_COPY.reading)).toBeNull();
    expect(screen.getByRole("button", { name: MESSAGES.takePhoto })).toBeTruthy();
    // Sam's photo went with Sam.
    expect(fakeFiles()).toEqual([]);

    await held.answer(0, reply(200, DRAFT));
    expect(screen.queryByLabelText("Title, required")).toBeNull();
    expect(screen.getByRole("button", { name: MESSAGES.takePhoto })).toBeTruthy();

    // Alex's own import works as normal.
    photoOnDisk();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);
    await waitFor(() => expect(held.count()).toBe(2));
    await held.answer(1, reply(200, { ...DRAFT, title: "Alex's soup" }));
    expect((await screen.findByLabelText("Title, required")).props.value).toBe("Alex's soup");
  });

  it("drops a read that fails after signing out", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    const become = await show();
    await press(MESSAGES.choosePhoto);
    await press(MESSAGES.extract);

    await become({ status: "signedOut", endedByServer: false, lastEmail: "sam@example.com" });
    await held.answer(0, reply(429, { detail: "slow down" }));
    expect(screen.queryByText(/Give it a few minutes/)).toBeNull();
    expect(screen.getByRole("header", { name: MESSAGES.signInHeading })).toBeTruthy();
  });
});

describe("two taps at once", () => {
  it("opens one picker when the camera and the library are tapped together", async () => {
    const { result } = await renderPhotoImport();
    await act(async () => {
      await Promise.all([result.current.choose("camera"), result.current.choose("library")]);
    });
    expect(picker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ step: "preview", photo: { uri: PREPARED }, problem: null });
  });

  it("calls the read off when a different photo is chosen as it starts, and nothing is sent", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    const { result } = await renderPhotoImport();
    await act(async () => result.current.choose("library"));

    let reading: Promise<void> = Promise.resolve();
    await act(async () => {
      reading = result.current.extract();
      result.current.chooseAgain();
      // A second Extract from the same render finds nothing left to send.
      await result.current.extract();
    });
    await act(async () => reading);

    await waitFor(() => expect(abortedExtractions()).toBe(1));
    // Calling the read off cancels the request itself, so it never reaches the server.
    expect(held.count()).toBe(0);
    expect(extractions()).toHaveLength(0);
    expect(fakeFiles()).toEqual([]);
    expect(result.current.state).toEqual({ step: "choose", problem: null });
  });

  it("sends one read when Extract runs twice from the same render", async () => {
    const held = heldExtractions();
    sent = serve({ "POST /recipes/extract": held.route });
    const { result } = await renderPhotoImport();
    await act(async () => result.current.choose("library"));

    const { extract } = result.current;
    let reading: Promise<void> = Promise.resolve();
    await act(async () => {
      reading = extract();
      await extract();
    });
    await waitFor(() => expect(held.count()).toBe(1));
    expect(extractions()).toHaveLength(1);

    await held.answer(0, reply(200, DRAFT));
    await act(async () => reading);
    expect(result.current.state).toEqual({ step: "review", draft: DRAFT });
  });
});

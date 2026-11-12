import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";
import { SCREENING_QUESTIONS } from "@myjobhunter/api-client/constants/screeningQuestions";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { PROFILE_MESSAGES as PROFILE } from "../src/constants/profile";
import { SCREENING_MESSAGES as SCREENING } from "../src/constants/profileScreening";
import { SKILL_MESSAGES as SKILLS } from "../src/constants/profileSkills";
import { store } from "../src/lib/store";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { NEW_IDS, profileRoutes } from "../test-support/profileRoutes";
import { renderProfile } from "../test-support/renderProfile";
import { screeningAnswerRecord } from "../test-support/screeningAnswerRecord";
import { skillRecord } from "../test-support/skillRecord";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const TYPESCRIPT = skillRecord({ id: "sk-1", name: "TypeScript", years_experience: 5 });
const SPONSORSHIP = screeningAnswerRecord({ id: "sa-1", question_key: "require_sponsorship", answer: "No" });
const GENDER = screeningAnswerRecord({ id: "sa-2", question_key: "eeoc_gender" });
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const sentTo = (sent: SentRequest[], route: string) => sent.filter((request) => request.route === route).map(({ body }) => body);

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("skills", () => {
  it("shows each skill with its years, and how to remove one", async () => {
    serve(profileRoutes({ skills: [TYPESCRIPT, skillRecord({ id: "sk-2", name: "Go" })] }));
    await renderProfile();

    const chip = await screen.findByTestId("skill-sk-1");
    expect(within(chip).getByText("TypeScript")).toBeTruthy();
    expect(within(chip).getByText("5 yrs")).toBeTruthy();
    expect(within(screen.getByTestId("skill-sk-2")).queryByText(/yrs?$/)).toBeNull();
    expect(screen.getByText(SKILLS.tapToRemove)).toBeTruthy();
  });

  it("adds a skill with its years, says so, and shows it", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SKILLS.add }));
    await fireEvent.changeText(screen.getByLabelText(`${SKILLS.nameLabel}, required`), " Rust ");
    await fireEvent.press(screen.getByRole("radio", { name: "10+ yrs" }));
    await fireEvent.press(screen.getByRole("button", { name: SKILLS.create }));

    expect(await screen.findByText(SKILLS.created)).toBeTruthy();
    expect(sentTo(sent, "POST /skills")).toEqual([{ name: "Rust", years_experience: 10, category: null }]);
    expect(within(await screen.findByTestId(`skill-${NEW_IDS.skill}`)).getByText("Rust")).toBeTruthy();
  });

  it("asks for a name, and catches a skill already there whatever its case, before sending", async () => {
    const sent = serve(profileRoutes({ skills: [TYPESCRIPT] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SKILLS.add }));
    await fireEvent.press(screen.getByRole("button", { name: SKILLS.create }));
    expect(await screen.findByText(PROBLEMS.skillRequired)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${SKILLS.nameLabel}, required`), "typescript");
    expect(await screen.findByText(PROBLEMS.skillDuplicate)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: SKILLS.create }));
    expect(sentTo(sent, "POST /skills")).toEqual([]);
  });

  it("shows the add in flight, then keeps what was typed and says why when it fails", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes(), "POST /skills": held.route });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SKILLS.add }));
    await fireEvent.changeText(screen.getByLabelText(`${SKILLS.nameLabel}, required`), "Rust");
    await fireEvent.press(screen.getByRole("button", { name: SKILLS.create }));

    expect(await screen.findByText(SKILLS.creating)).toBeTruthy();
    await held.answer(0, { status: 500 });
    expect(await screen.findByText(SKILLS.couldntCreate)).toBeTruthy();
    expect(screen.getByLabelText(`${SKILLS.nameLabel}, required`).props.value).toBe("Rust");
  });

  it("says the skill is already there when the server finds it taken (a 409)", async () => {
    serve({ ...profileRoutes(), "POST /skills": () => ({ status: 409, data: { detail: "Skill already exists" } }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SKILLS.add }));
    await fireEvent.changeText(screen.getByLabelText(`${SKILLS.nameLabel}, required`), "Rust");
    await fireEvent.press(screen.getByRole("button", { name: SKILLS.create }));

    expect(await screen.findByText(PROBLEMS.skillDuplicate)).toBeTruthy();
    expect(screen.queryByText(SKILLS.couldntCreate)).toBeNull();
  });

  it("removes a skill when it's tapped, after asking, and takes it off the profile", async () => {
    const sent = serve(profileRoutes({ skills: [TYPESCRIPT] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} TypeScript` }));

    expect(alert).toHaveBeenCalledWith(SKILLS.removeTitle, `TypeScript — ${SKILLS.removeBody}`, expect.any(Array));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByText(SKILLS.removed)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "DELETE /skills/sk-1")).toHaveLength(1);
    expect(await screen.findByText(SKILLS.none)).toBeTruthy();
  });

  it("shows the removal in flight, and keeps the skill when it fails", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes({ skills: [TYPESCRIPT] }), "DELETE /skills/sk-1": held.route });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} TypeScript` }));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByLabelText(PROFILE.removing)).toBeTruthy();
    expect(screen.getByTestId("skill-sk-1").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
    await held.answer(0, { status: 500 });

    expect(await screen.findByText(SKILLS.couldntRemove)).toBeTruthy();
    expect(screen.getByTestId("skill-sk-1")).toBeTruthy();
  });
});

describe("screening answers", () => {
  it("shows answers grouped into standard and EEOC questions, by their question's name", async () => {
    serve(profileRoutes({ answers: [SPONSORSHIP, GENDER] }));
    await renderProfile();

    const sponsorship = await screen.findByTestId("screening-sa-1");
    expect(within(sponsorship).getByText("Requires visa sponsorship")).toBeTruthy();
    expect(within(sponsorship).getByText("No")).toBeTruthy();
    expect(within(screen.getByTestId("screening-sa-2")).getByText(SCREENING.noAnswer)).toBeTruthy();
    expect(screen.getByRole("header", { name: SCREENING.standard })).toBeTruthy();
    expect(screen.getByRole("header", { name: SCREENING.eeoc })).toBeTruthy();
  });

  it("adds an answer: offers only unanswered questions, then takes the answer, says so, and shows it", async () => {
    const sent = serve(profileRoutes({ answers: [SPONSORSHIP] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SCREENING.add }));

    expect(screen.getByText(SCREENING.chooseIntro)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Requires visa sponsorship" })).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Notice period" }));
    await fireEvent.press(screen.getByRole("button", { name: SCREENING.changeQuestion }));
    await fireEvent.press(screen.getByRole("radio", { name: "Willing to relocate" }));

    expect(screen.getByText("Willing to relocate")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(SCREENING.answerLabel), "  Yes, anywhere in the US ");
    await fireEvent.press(screen.getByRole("button", { name: SCREENING.create }));

    expect(await screen.findByText(SCREENING.created)).toBeTruthy();
    expect(sentTo(sent, "POST /screening-answers")).toEqual([{ question_key: "willing_to_relocate", answer: "Yes, anywhere in the US" }]);
    expect(within(await screen.findByTestId(`screening-${NEW_IDS.answer}`)).getByText("Yes, anywhere in the US")).toBeTruthy();
  });

  it("says the question is already answered when the server finds it taken (a 409)", async () => {
    serve({ ...profileRoutes(), "POST /screening-answers": () => ({ status: 409, data: { detail: "Already answered" } }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: SCREENING.add }));
    await fireEvent.press(screen.getByRole("radio", { name: "Notice period" }));
    await fireEvent.changeText(screen.getByLabelText(SCREENING.answerLabel), "Two weeks");
    await fireEvent.press(screen.getByRole("button", { name: SCREENING.create }));

    expect(await screen.findByText(SCREENING.alreadyAnswered)).toBeTruthy();
    expect(screen.getByLabelText(SCREENING.answerLabel).props.value).toBe("Two weeks");
  });

  it("edits an answer, keeping its question, and shows the change", async () => {
    const sent = serve(profileRoutes({ answers: [SPONSORSHIP] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Requires visa sponsorship` }));

    expect(screen.getByText(SCREENING.editTitle)).toBeTruthy();
    expect(screen.queryByRole("button", { name: SCREENING.changeQuestion })).toBeNull();
    expect(screen.getByLabelText(SCREENING.answerLabel).props.value).toBe("No");
    await fireEvent.changeText(screen.getByLabelText(SCREENING.answerLabel), "Yes, H-1B transfer");
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(SCREENING.updated)).toBeTruthy();
    expect(sentTo(sent, "PATCH /screening-answers/sa-1")).toEqual([{ answer: "Yes, H-1B transfer" }]);
    expect(await within(screen.getByTestId("screening-sa-1")).findByText("Yes, H-1B transfer")).toBeTruthy();
  });

  it("keeps the answer typed and says why when saving it fails", async () => {
    serve({ ...profileRoutes({ answers: [SPONSORSHIP] }), "PATCH /screening-answers/sa-1": () => ({ status: 500 }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Requires visa sponsorship` }));
    await fireEvent.changeText(screen.getByLabelText(SCREENING.answerLabel), "Maybe");
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(SCREENING.couldntUpdate)).toBeTruthy();
    expect(screen.getByLabelText(SCREENING.answerLabel).props.value).toBe("Maybe");
  });

  it("removes an answer after asking, and takes it off the profile", async () => {
    const sent = serve(profileRoutes({ answers: [SPONSORSHIP] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} Requires visa sponsorship` }));
    expect(alert).toHaveBeenCalledWith(SCREENING.removeTitle, SCREENING.removeBody, expect.any(Array));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByText(SCREENING.removed)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "DELETE /screening-answers/sa-1")).toHaveLength(1);
    expect(await screen.findByText(SCREENING.none)).toBeTruthy();
  });

  it("turns Add off, and says why, once every question is answered", async () => {
    const answers = SCREENING_QUESTIONS.map(({ key }, index) => screeningAnswerRecord({ id: `sa-${index}`, question_key: key, answer: "Yes" }));
    serve(profileRoutes({ answers }));
    await renderProfile();

    expect(await screen.findByText(SCREENING.allAnswered)).toBeTruthy();
    expect(screen.getByRole("button", { name: SCREENING.add }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

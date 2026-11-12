import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { PROFILE_MESSAGES as PROFILE } from "../src/constants/profile";
import { EDUCATION_MESSAGES as EDUCATION } from "../src/constants/profileEducation";
import { WORK_HISTORY_MESSAGES as WORK } from "../src/constants/profileWorkHistory";
import { store } from "../src/lib/store";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { educationRecord } from "../test-support/educationRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { NEW_IDS, profileRoutes } from "../test-support/profileRoutes";
import { renderProfile } from "../test-support/renderProfile";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { workHistoryRecord } from "../test-support/workHistoryRecord";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const ACME = workHistoryRecord({
  id: "wh-1",
  company_name: "Acme Corp",
  title: "Senior Engineer",
  start_date: "2021-03-04",
  is_current: true,
  bullets: ["Led the rewrite", "Cut latency by 40%"],
});
const STATE = educationRecord({ id: "ed-1", school: "State University", degree: "B.S.", field: "Computer Science", start_year: 2014, end_year: 2018, gpa: "3.80" });
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

/** Opens a date field's picker, turns it to `date`, and closes it again. */
async function pickDate(label: string, date: Date): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `Choose ${label.toLowerCase()}` }));
  await fireEvent(screen.getByTestId(`${label}-picker`), "change", {}, date);
  await fireEvent.press(screen.getByRole("button", { name: `Done choosing ${label.toLowerCase()}` }));
}

describe("work history", () => {
  it("shows each role's title, company, dates and bullets", async () => {
    serve(profileRoutes({ workHistory: [ACME, workHistoryRecord({ id: "wh-2", company_name: "Initech", start_date: "2018-01-15", end_date: "2021-02-01" })] }));
    await renderProfile();

    const acme = await screen.findByTestId("work-history-wh-1");
    expect(within(acme).getByText("Senior Engineer")).toBeTruthy();
    expect(within(acme).getByText("Acme Corp")).toBeTruthy();
    expect(within(acme).getByText("Mar 2021 – Present")).toBeTruthy();
    expect(within(acme).getByText("• Led the rewrite")).toBeTruthy();
    expect(within(screen.getByTestId("work-history-wh-2")).getByText("Jan 2018 – Feb 2021")).toBeTruthy();
    expect(within(screen.getByTestId("profile-work-history")).getByRole("header", { name: `${WORK.title} (2)` })).toBeTruthy();
  });

  it("adds a role with dates picked on the phone, one bullet per line, says so, and shows it", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: WORK.add }));

    await fireEvent.changeText(screen.getByLabelText(`${WORK.companyLabel}, required`), "  Globex ");
    await fireEvent.changeText(screen.getByLabelText(`${WORK.titleLabel}, required`), "Staff Engineer");
    await pickDate(WORK.startLabel, new Date(2019, 5, 10));
    expect(screen.getByText("Jun 10, 2019")).toBeTruthy();
    await pickDate(WORK.endLabel, new Date(2022, 0, 31));
    await fireEvent.changeText(screen.getByLabelText(WORK.bulletsLabel), "Shipped billing\n\n  Mentored three engineers  ");
    await fireEvent.press(screen.getByRole("button", { name: WORK.create }));

    expect(await screen.findByText(WORK.created)).toBeTruthy();
    expect(sentTo(sent, "POST /work-history")).toEqual([
      {
        company_name: "Globex",
        title: "Staff Engineer",
        start_date: "2019-06-10",
        end_date: "2022-01-31",
        is_current: false,
        bullets: ["Shipped billing", "Mentored three engineers"],
      },
    ]);
    const card = await screen.findByTestId(`work-history-${NEW_IDS.workHistory}`);
    expect(within(card).getByText("Jun 2019 – Jan 2022")).toBeTruthy();
  });

  it("hides and clears the end date for a current role", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: WORK.add }));
    await fireEvent.changeText(screen.getByLabelText(`${WORK.companyLabel}, required`), "Globex");
    await fireEvent.changeText(screen.getByLabelText(`${WORK.titleLabel}, required`), "Engineer");
    await pickDate(WORK.startLabel, new Date(2019, 5, 10));
    await pickDate(WORK.endLabel, new Date(2022, 0, 31));

    await fireEvent(screen.getByLabelText(WORK.currentLabel), "valueChange", true);
    expect(screen.queryByText(WORK.endLabel)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: WORK.create }));

    expect(await screen.findByText(WORK.created)).toBeTruthy();
    expect(sentTo(sent, "POST /work-history")).toEqual([expect.objectContaining({ end_date: null, is_current: true })]);
  });

  it("asks for the company, title and start date, and an end date after the start, before sending", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: WORK.add }));
    await fireEvent.press(screen.getByRole("button", { name: WORK.create }));

    expect(await screen.findByText(PROBLEMS.companyRequired)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.titleRequired)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.startDateRequired)).toBeTruthy();

    await pickDate(WORK.startLabel, new Date(2022, 0, 1));
    await pickDate(WORK.endLabel, new Date(2021, 0, 1));
    expect(await screen.findByText(PROBLEMS.endBeforeStart)).toBeTruthy();
    expect(sentTo(sent, "POST /work-history")).toEqual([]);
  });

  it("offers no end date before the start date", async () => {
    serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: WORK.add }));
    await pickDate(WORK.startLabel, new Date(2019, 5, 10));
    await fireEvent.press(screen.getByRole("button", { name: `Choose ${WORK.endLabel.toLowerCase()}` }));

    expect(screen.getByTestId(`${WORK.endLabel}-picker`).props.minimumDate).toEqual(new Date(2019, 5, 10));
  });

  it("closes an open date picker when the save starts, and keeps it closed if the save fails", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes({ workHistory: [ACME] }), "PATCH /work-history/wh-1": held.route });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Acme Corp` }));
    await fireEvent.press(screen.getByRole("button", { name: `Change ${WORK.startLabel.toLowerCase()}` }));
    expect(screen.getByTestId(`${WORK.startLabel}-picker`)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));
    expect(screen.queryByTestId(`${WORK.startLabel}-picker`)).toBeNull();
    await held.answer(0, { status: 500 });

    expect(await screen.findByText(WORK.couldntUpdate)).toBeTruthy();
    expect(screen.queryByTestId(`${WORK.startLabel}-picker`)).toBeNull();
    expect(screen.getByRole("button", { name: `Change ${WORK.startLabel.toLowerCase()}` })).toBeTruthy();
  });

  it("edits a role from what's saved, sending every field, and shows the change", async () => {
    const sent = serve(profileRoutes({ workHistory: [ACME] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Acme Corp` }));

    expect(screen.getByText(WORK.editTitle)).toBeTruthy();
    expect(screen.getByLabelText(WORK.bulletsLabel).props.value).toBe("Led the rewrite\nCut latency by 40%");
    await fireEvent.changeText(screen.getByLabelText(`${WORK.titleLabel}, required`), "Principal Engineer");
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(WORK.updated)).toBeTruthy();
    expect(sentTo(sent, "PATCH /work-history/wh-1")).toEqual([
      {
        company_name: "Acme Corp",
        title: "Principal Engineer",
        start_date: "2021-03-04",
        end_date: null,
        is_current: true,
        bullets: ["Led the rewrite", "Cut latency by 40%"],
      },
    ]);
    expect(await within(screen.getByTestId("work-history-wh-1")).findByText("Principal Engineer")).toBeTruthy();
  });

  it("shows the save in flight, then keeps what was typed and says why when it fails", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes({ workHistory: [ACME] }), "PATCH /work-history/wh-1": held.route });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Acme Corp` }));
    await fireEvent.changeText(screen.getByLabelText(`${WORK.titleLabel}, required`), "CTO");
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(PROFILE.saving)).toBeTruthy();
    expect(screen.getByRole("button", { name: PROFILE.cancel }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await held.answer(0, { status: 500 });

    expect(await screen.findByText(WORK.couldntUpdate)).toBeTruthy();
    expect(screen.getByLabelText(`${WORK.titleLabel}, required`).props.value).toBe("CTO");
  });

  it("says the role is gone when an edit gets a 404", async () => {
    serve({ ...profileRoutes({ workHistory: [ACME] }), "PATCH /work-history/wh-1": () => ({ status: 404, data: { detail: "Not found" } }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} Acme Corp` }));
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(PROFILE.gone)).toBeTruthy();
  });

  it("never says a new role was already deleted, whatever the add fails with", async () => {
    serve({ ...profileRoutes(), "POST /work-history": () => ({ status: 404, data: { detail: "Not found" } }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: WORK.add }));
    await fireEvent.changeText(screen.getByLabelText(`${WORK.companyLabel}, required`), "Globex");
    await fireEvent.changeText(screen.getByLabelText(`${WORK.titleLabel}, required`), "Engineer");
    await pickDate(WORK.startLabel, new Date(2019, 5, 10));
    await fireEvent.press(screen.getByRole("button", { name: WORK.create }));

    expect(await screen.findByText(WORK.couldntCreate)).toBeTruthy();
    expect(screen.queryByText(PROFILE.gone)).toBeNull();
  });

  it("deletes a role after asking, says so, and takes it off the list", async () => {
    const sent = serve(profileRoutes({ workHistory: [ACME] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} Acme Corp` }));

    expect(alert).toHaveBeenCalledWith(WORK.removeTitle, WORK.removeBody, expect.any(Array));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByText(WORK.removed)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "DELETE /work-history/wh-1")).toHaveLength(1);
    expect(await screen.findByText(WORK.none)).toBeTruthy();
  });

  it("keeps a role when Keep is chosen, and when the delete fails", async () => {
    const sent = serve({ ...profileRoutes({ workHistory: [ACME] }), "DELETE /work-history/wh-1": () => ({ status: 500 }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} Acme Corp` }));
    await act(async () => alertButton(PROFILE.keep).onPress?.());
    expect(sent.filter(({ route }) => route === "DELETE /work-history/wh-1")).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: `${PROFILE.remove} Acme Corp` }));
    await act(async () => alertButton(PROFILE.remove).onPress?.());
    expect(await screen.findByText(WORK.couldntRemove)).toBeTruthy();
    expect(screen.getByTestId("work-history-wh-1")).toBeTruthy();
    expect(screen.getByRole("button", { name: `${PROFILE.remove} Acme Corp` })).toBeTruthy();
  });
});

describe("education", () => {
  it("shows each school with its degree, years and GPA", async () => {
    serve(profileRoutes({ education: [STATE] }));
    await renderProfile();

    const card = await screen.findByTestId("education-ed-1");
    expect(within(card).getByText("State University")).toBeTruthy();
    expect(within(card).getByText("B.S. in Computer Science")).toBeTruthy();
    expect(within(card).getByText("2014 – 2018")).toBeTruthy();
    expect(within(card).getByText("GPA: 3.80")).toBeTruthy();
  });

  it("adds a school, sending blanks as null and years as numbers, and shows it", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: EDUCATION.add }));
    await fireEvent.changeText(screen.getByLabelText(`${EDUCATION.schoolLabel}, required`), " Tech Institute ");
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.startYearLabel), "2016");
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.gpaLabel), "3.9");
    await fireEvent.press(screen.getByRole("button", { name: EDUCATION.create }));

    expect(await screen.findByText(EDUCATION.created)).toBeTruthy();
    expect(sentTo(sent, "POST /education")).toEqual([{ school: "Tech Institute", degree: null, field: null, start_year: 2016, end_year: null, gpa: "3.9" }]);
    expect(within(await screen.findByTestId(`education-${NEW_IDS.education}`)).getByText("Tech Institute")).toBeTruthy();
  });

  it("asks for the school, and checks the years and GPA, before sending", async () => {
    const sent = serve(profileRoutes());
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: EDUCATION.add }));
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.startYearLabel), "1900");
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.gpaLabel), "four");
    await fireEvent.press(screen.getByRole("button", { name: EDUCATION.create }));

    expect(await screen.findByText(PROBLEMS.schoolRequired)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.year)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.gpa)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(EDUCATION.startYearLabel), "2018");
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.endYearLabel), "2014");
    expect(await screen.findByText(PROBLEMS.endYearBeforeStart)).toBeTruthy();
    expect(sentTo(sent, "POST /education")).toEqual([]);
  });

  it("edits a school from what's saved, and shows the change", async () => {
    const sent = serve(profileRoutes({ education: [STATE] }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.edit} State University` }));

    expect(screen.getByLabelText(EDUCATION.startYearLabel).props.value).toBe("2014");
    await fireEvent.changeText(screen.getByLabelText(EDUCATION.degreeLabel), "M.S.");
    await fireEvent.press(screen.getByRole("button", { name: PROFILE.saveChanges }));

    expect(await screen.findByText(EDUCATION.updated)).toBeTruthy();
    expect(sentTo(sent, "PATCH /education/ed-1")).toEqual([
      { school: "State University", degree: "M.S.", field: "Computer Science", start_year: 2014, end_year: 2018, gpa: "3.80" },
    ]);
    expect(await within(screen.getByTestId("education-ed-1")).findByText("M.S. in Computer Science")).toBeTruthy();
  });

  it("treats a delete's 404 as already deleted, and takes the school off the list", async () => {
    const routes = profileRoutes({ education: [STATE] });
    serve({
      ...routes,
      // Deleted elsewhere first: the server no longer has it, and says so.
      "DELETE /education/ed-1": (body, params) => {
        void routes["DELETE /education/ed-1"]?.(body, params);
        return { status: 404, data: { detail: "Not found" } };
      },
    });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} State University` }));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByText(EDUCATION.removed)).toBeTruthy();
    expect(screen.queryByText(EDUCATION.couldntRemove)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("education-ed-1")).toBeNull());
    expect(await screen.findByText(EDUCATION.none)).toBeTruthy();
  });

  it("takes a deleted school off the list even when the reload after it fails", async () => {
    let reloadFails = false;
    const routes = profileRoutes({ education: [STATE] });
    serve({
      ...routes,
      "GET /education": (body, params) => (reloadFails ? { status: 500 } : routes["GET /education"]?.(body, params) ?? { status: 500 }),
      "DELETE /education/ed-1": (body, params) => {
        reloadFails = true;
        return routes["DELETE /education/ed-1"]?.(body, params) ?? { status: 500 };
      },
    });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("button", { name: `${PROFILE.remove} State University` }));
    await act(async () => alertButton(PROFILE.remove).onPress?.());

    expect(await screen.findByText(EDUCATION.removed)).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("education-ed-1")).toBeNull());
    expect(screen.queryByText(PROFILE.removing)).toBeNull();
  });
});

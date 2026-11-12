import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/contactFieldLimits";
import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";
import { Alert } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as CONTACTS } from "../src/constants/applicationContacts";
import { APPLICATION_DETAIL_MESSAGES } from "../src/constants/applicationDetail";
import { CONTACT_FIELD_PROBLEMS as PROBLEMS } from "../src/constants/contactFieldProblems";
import { store } from "../src/lib/store";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { contactRecord } from "../test-support/contactRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApplicationDetail } from "../test-support/renderApplicationDetail";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, usePreventRemove: jest.fn() }));

const ID = "app-stripe";
const SAM = contactRecord({ id: "k-1", application_id: ID, name: "Sam Lee", role: "recruiter", email: "sam@stripe.com" });
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

/** The application's routes, its contacts held in memory so a write shows in the refetch. */
function serveContacts(initial: ApplicationContact[], writes: Record<string, FakeRoute> = {}) {
  let contacts = [...initial];
  const application = applicationDetailRecord({ id: ID, contacts });
  return serve({
    ...applicationDetailRoutes(application),
    [`GET /applications/${ID}`]: () => ({ status: 200, data: { ...application, contacts } }) satisfies FakeReply,
    [`POST /applications/${ID}/contacts`]: (body) => {
      const created = contactRecord({ id: "k-new", application_id: ID, ...body });
      contacts = [...contacts, created];
      return { status: 201, data: created };
    },
    [`DELETE /applications/${ID}/contacts/k-1`]: () => {
      contacts = contacts.filter(({ id }) => id !== "k-1");
      return { status: 204 };
    },
    ...writes,
  });
}

const posts = (sent: ReturnType<typeof serve>) => sent.filter(({ route }) => route === `POST /applications/${ID}/contacts`);
const deletes = (sent: ReturnType<typeof serve>) => sent.filter(({ route }) => route === `DELETE /applications/${ID}/contacts/k-1`);

async function openSheet(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: CONTACTS.add }));
}

describe("the contacts' empty state", () => {
  it("says there are none and offers to add one", async () => {
    serveContacts([]);
    await renderApplicationDetail(ID);
    expect(await screen.findByText(CONTACTS.none)).toBeTruthy();
    expect(screen.getByText(CONTACTS.noneBody)).toBeTruthy();
    expect(screen.getByRole("button", { name: CONTACTS.add })).toBeTruthy();
  });
});

describe("adding a contact", () => {
  it("sends the trimmed fields for this application, says so, and shows them", async () => {
    const sent = serveContacts([]);
    await renderApplicationDetail(ID);
    await openSheet();

    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "  Grace Hopper ");
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.emailLabel), "grace@stripe.com");
    await fireEvent.press(screen.getByRole("radio", { name: "Hiring manager" }));
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.linkedInLabel), "https://www.linkedin.com/in/grace");
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.notesLabel), "Met at the meetup.");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(CONTACTS.created)).toBeTruthy();
    expect(posts(sent).map(({ body }) => body)).toEqual([
      {
        name: "Grace Hopper",
        email: "grace@stripe.com",
        role: "hiring_manager",
        linkedin_url: "https://www.linkedin.com/in/grace",
        notes: "Met at the meetup.",
      },
    ]);
    expect(within(await screen.findByTestId("contact-k-new")).getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText(CONTACTS.addIntro)).toBeNull();
  });

  it("starts on No role, and leaves the role out when a picked role is cleared", async () => {
    const sent = serveContacts([]);
    await renderApplicationDetail(ID);
    await openSheet();

    const noRole = screen.getByRole("radio", { name: CONTACTS.noRole });
    expect(noRole.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("radio", { name: "Recruiter" }));
    expect(screen.getByRole("radio", { name: "Recruiter" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("radio", { name: CONTACTS.noRole }));
    expect(screen.getByRole("radio", { name: CONTACTS.noRole }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));

    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "Sam");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(CONTACTS.created)).toBeTruthy();
    expect(posts(sent).map(({ body }) => body)).toEqual([{ name: "Sam" }]);
  });

  it("asks for a name or an email, and checks the email and link, before sending", async () => {
    const sent = serveContacts([]);
    await renderApplicationDetail(ID);
    await openSheet();

    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));
    expect(await screen.findByText(PROBLEMS.name.identity_required ?? "")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(CONTACTS.emailLabel), "sam at stripe");
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.linkedInLabel), "intent://evil");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));
    expect(await screen.findByText(PROBLEMS.email.invalid ?? "")).toBeTruthy();
    expect(screen.getByText(PROBLEMS.linkedin_url.invalid ?? "")).toBeTruthy();
    expect(posts(sent)).toHaveLength(0);
  });

  it("says a pasted value is too long, rather than cutting it, and sends nothing", async () => {
    const sent = serveContacts([]);
    await renderApplicationDetail(ID);
    await openSheet();
    const email = `${"e".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.com`;
    expect(email).toHaveLength(CONTACT_EMAIL_MAX_LENGTH + 1);

    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "n".repeat(CONTACT_NAME_MAX_LENGTH + 1));
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.emailLabel), email);
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.linkedInLabel), `https://${"l".repeat(CONTACT_LINKEDIN_MAX_LENGTH)}`);
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.notesLabel), "o".repeat(CONTACT_NOTES_MAX_LENGTH + 1));
    expect(screen.getByLabelText(CONTACTS.nameLabel).props.maxLength).toBeUndefined();
    expect(screen.getByLabelText(CONTACTS.emailLabel).props.value).toBe(email);
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(PROBLEMS.name.too_long ?? "")).toBeTruthy();
    expect(screen.getByText(PROBLEMS.email.too_long ?? "")).toBeTruthy();
    expect(screen.getByText(PROBLEMS.linkedin_url.too_long ?? "")).toBeTruthy();
    expect(screen.getByText(PROBLEMS.notes.too_long ?? "")).toBeTruthy();
    expect(posts(sent)).toHaveLength(0);
  });

  it("adds https:// to a LinkedIn link typed without one", async () => {
    const sent = serveContacts([]);
    await renderApplicationDetail(ID);
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "Sam");
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.linkedInLabel), "www.linkedin.com/in/sam");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(CONTACTS.created)).toBeTruthy();
    expect(posts(sent).map(({ body }) => body)).toEqual([{ name: "Sam", linkedin_url: "https://www.linkedin.com/in/sam" }]);
  });

  it("shows the server's 422 reason under the field it names, until that field changes", async () => {
    const reason = "value is not a valid email address: bad domain";
    serveContacts([], {
      [`POST /applications/${ID}/contacts`]: () => ({ status: 422, data: { detail: [{ loc: ["body", "email"], msg: reason, type: "value_error" }] } }),
    });
    await renderApplicationDetail(ID);
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.emailLabel), "sam@stripe.com");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(reason)).toBeTruthy();
    expect(screen.getByText(CONTACTS.checkFields)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.emailLabel), "sam@stripe.co");
    expect(screen.queryByText(reason)).toBeNull();
  });

  it("shows the add in flight at once and holds Cancel until it lands", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serveContacts([], { [`POST /applications/${ID}/contacts`]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await renderApplicationDetail(ID);
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "Sam");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(CONTACTS.creating)).toBeTruthy();
    expect(screen.getByRole("button", { name: CONTACTS.cancel }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => answer({ status: 201, data: contactRecord({ id: "k-new", application_id: ID, name: "Sam" }) }));
    expect(await screen.findByText(CONTACTS.created)).toBeTruthy();
  });

  it("keeps the sheet and what was typed, with the reason at the top, when the add fails", async () => {
    serveContacts([], { [`POST /applications/${ID}/contacts`]: () => ({ status: 500 }) });
    await renderApplicationDetail(ID);
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(CONTACTS.nameLabel), "Sam");
    await fireEvent.press(screen.getByRole("button", { name: CONTACTS.create }));

    expect(await screen.findByText(CONTACTS.couldntCreate)).toBeTruthy();
    expect(screen.getByLabelText(CONTACTS.nameLabel).props.value).toBe("Sam");
    expect(screen.queryByText(CONTACTS.created)).toBeNull();
  });
});

describe("removing a contact", () => {
  const removeButton = () => screen.findByRole("button", { name: `${CONTACTS.remove} Sam Lee` });

  it("removes them after asking, says so, and takes them off the list", async () => {
    const sent = serveContacts([SAM]);
    await renderApplicationDetail(ID);
    await fireEvent.press(await removeButton());

    expect(alert).toHaveBeenCalledWith(CONTACTS.removeTitle, `Sam Lee — ${CONTACTS.removeBody}`, expect.any(Array));
    await act(async () => alertButton(CONTACTS.remove).onPress?.());

    expect(await screen.findByText(CONTACTS.removed)).toBeTruthy();
    expect(deletes(sent)).toHaveLength(1);
    expect(await screen.findByText(CONTACTS.none)).toBeTruthy();
    expect(screen.queryByTestId("contact-k-1")).toBeNull();
  });

  it("does nothing when they keep them", async () => {
    const sent = serveContacts([SAM]);
    await renderApplicationDetail(ID);
    await fireEvent.press(await removeButton());
    await act(async () => alertButton(CONTACTS.keep).onPress?.());

    expect(deletes(sent)).toHaveLength(0);
    expect(screen.getByTestId("contact-k-1")).toBeTruthy();
  });

  it("treats a 404 as already removed, and never says the application is gone", async () => {
    let contacts: ApplicationContact[] = [SAM];
    serve({
      ...applicationDetailRoutes(applicationDetailRecord({ id: ID })),
      [`GET /applications/${ID}`]: () => ({ status: 200, data: applicationDetailRecord({ id: ID, contacts }) }),
      [`DELETE /applications/${ID}/contacts/k-1`]: () => {
        contacts = [];
        return { status: 404, data: { detail: "Contact not found" } };
      },
    });
    await renderApplicationDetail(ID);
    await fireEvent.press(await removeButton());
    await act(async () => alertButton(CONTACTS.remove).onPress?.());

    expect(await screen.findByText(CONTACTS.removed)).toBeTruthy();
    expect(screen.queryByText(CONTACTS.couldntRemove)).toBeNull();
    expect(screen.queryByText(APPLICATION_DETAIL_MESSAGES.gone)).toBeNull();
    expect(await screen.findByText(CONTACTS.none)).toBeTruthy();
  });

  it("takes them off the list, without spinning, even when the reload after the removal fails", async () => {
    let reloadFails = false;
    serve({
      ...applicationDetailRoutes(applicationDetailRecord({ id: ID })),
      [`GET /applications/${ID}`]: () =>
        reloadFails ? { status: 503, data: { detail: "down" } } : { status: 200, data: applicationDetailRecord({ id: ID, contacts: [SAM] }) },
      [`DELETE /applications/${ID}/contacts/k-1`]: () => {
        reloadFails = true;
        return { status: 204 };
      },
    });
    await renderApplicationDetail(ID);
    await fireEvent.press(await removeButton());
    await act(async () => alertButton(CONTACTS.remove).onPress?.());

    expect(await screen.findByText(CONTACTS.removed)).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("contact-k-1")).toBeNull());
    expect(screen.queryByText(CONTACTS.removing)).toBeNull();
    expect(screen.getByText(CONTACTS.none)).toBeTruthy();
  });

  it("says so and keeps them when the removal fails", async () => {
    serveContacts([SAM], { [`DELETE /applications/${ID}/contacts/k-1`]: () => ({ status: 500 }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await removeButton());
    await act(async () => alertButton(CONTACTS.remove).onPress?.());

    expect(await screen.findByText(CONTACTS.couldntRemove)).toBeTruthy();
    expect(screen.getByTestId("contact-k-1")).toBeTruthy();
    expect(await removeButton()).toBeTruthy();
  });
});

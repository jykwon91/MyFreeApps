import { APPLICANT_CONTACT_EMAIL_MESSAGES as CONTACT } from "@mybookkeeper/api-client/constants/applicantContactEmail";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl } from "react-native";
import { Provider } from "react-redux";
import { MEMBERS_MESSAGES as MEMBERS } from "../src/constants/members";
import { PROPERTY_FORM_MESSAGES as PROPERTY } from "../src/constants/propertyForm";
import { VENDOR_FORM_MESSAGES as VENDOR } from "../src/constants/vendorForm";
import { WELCOME_MANUAL_EMAIL_MESSAGES as GUEST } from "../src/constants/welcomeManualForms";
import ApplicantContact from "../src/features/applicants/ApplicantContact";
import PromoteForm from "../src/features/applicants/PromoteForm";
import InviteSheet from "../src/features/members/InviteSheet";
import PropertyFormScreen from "../src/features/properties/PropertyFormScreen";
import VendorFormScreen from "../src/features/vendors/VendorFormScreen";
import WelcomeManualEmailForm from "../src/features/welcomeManuals/WelcomeManualEmailForm";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { store } from "../src/lib/store";
import { anInquiry } from "../test-support/inquiriesServer";
import { aManual } from "../test-support/aWelcomeManual";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// Asks the phone not to autofill the owner's own details into someone else's field.
const NO_AUTOFILL = { autoComplete: "off", textContentType: "none" };
const THEIR_NAME = { ...NO_AUTOFILL, autoCapitalize: "words" };
const THEIR_EMAIL = { ...NO_AUTOFILL, keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false };
const THEIR_PHONE = { ...NO_AUTOFILL, keyboardType: "phone-pad" };

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

async function show(element: React.ReactElement): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const propsOf = (label: string) => screen.getByLabelText(label).props;

describe("fields for someone else's details", () => {
  it("a vendor's name, phone, email and address, with the right keyboards", async () => {
    await show(<VendorFormScreen original={null} />);
    expect(propsOf(`${VENDOR.name}, required`)).toMatchObject(THEIR_NAME);
    expect(propsOf(VENDOR.phone)).toMatchObject(THEIR_PHONE);
    expect(propsOf(VENDOR.email)).toMatchObject(THEIR_EMAIL);
    expect(propsOf(VENDOR.address)).toMatchObject(THEIR_NAME);
    expect(propsOf(VENDOR.hourlyRate).keyboardType).toBe("decimal-pad");
  });

  it("a rental's address, keeping all-capitals for the state and the ZIP keyboard", async () => {
    await show(<PropertyFormScreen original={null} />);
    expect(propsOf(`${PROPERTY.street}, required`)).toMatchObject({ ...NO_AUTOFILL, autoCapitalize: "words" });
    expect(propsOf(`${PROPERTY.city}, required`)).toMatchObject({ ...NO_AUTOFILL, autoCapitalize: "words" });
    expect(propsOf(`${PROPERTY.state}, required`)).toMatchObject({ ...NO_AUTOFILL, autoCapitalize: "characters" });
    expect(propsOf(`${PROPERTY.zip}, required`)).toMatchObject({ ...NO_AUTOFILL, keyboardType: "numbers-and-punctuation" });
    expect(propsOf(PROPERTY.purchasePrice).keyboardType).toBe("decimal-pad");
  });

  it("the email of someone being invited", async () => {
    await show(<InviteSheet initialEmail="" initialRole="viewer" onClose={jest.fn()} onSend={jest.fn()} orgName="Acme" />);
    expect(propsOf(MEMBERS.email)).toMatchObject(THEIR_EMAIL);
  });

  it("an applicant's email", async () => {
    await show(<ApplicantContact applicantId="a1" canWrite email={null} name="Sam Ortiz" phone={null} />);
    await fireEvent.press(screen.getByRole("button", { name: CONTACT.add }));
    expect(propsOf(CONTACT.label)).toMatchObject(THEIR_EMAIL);
  });

  it("a guest's email and name for a welcome manual", async () => {
    await show(<WelcomeManualEmailForm manual={aManual()} refreshControl={<RefreshControl refreshing={false} />} />);
    expect(propsOf(`${GUEST.emailLabel}, required`)).toMatchObject(THEIR_EMAIL);
    expect(propsOf(GUEST.nameLabel)).toMatchObject(THEIR_NAME);
  });

  it("a new tenant's legal name, employer and referrer", async () => {
    await show(<PromoteForm inquiry={anInquiry()} />);
    expect(propsOf("Legal name")).toMatchObject(THEIR_NAME);
    expect(propsOf("Employer or hospital")).toMatchObject(NO_AUTOFILL);
    expect(propsOf("Referred by")).toMatchObject(THEIR_NAME);
  });
});

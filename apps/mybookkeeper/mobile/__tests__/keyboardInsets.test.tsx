import { join } from "path";
import { KEYBOARD_FIELD_CLEARANCE } from "@platform/mobile";
import { codeOf, keyboardHandlingProblems } from "@platform/mobile/test-support/keyboardHandlingProblems";
import { nodesOfType } from "@platform/mobile/test-support/renderedNodes";
import type { RenderedNode } from "@platform/mobile/test-support/types/RenderedNode";
import { screen } from "@testing-library/react-native";
import EndTenancySheet from "../src/features/tenants/EndTenancySheet";
import TaxFieldOverrideForm from "../src/features/taxReturns/TaxFieldOverrideForm";
import VendorFormScreen from "../src/features/vendors/VendorFormScreen";
import { aTaxField } from "../test-support/aTaxForm";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  usePreventRemove: () => undefined,
}));

const FEATURES = join(__dirname, "..", "src", "features");

// Each has a scroll view and nothing pinned below it: 7 are page-sheet modals, the rest sit under a stack header.
// MoreScreen's search scrolls the same way.
const SCROLL_ONLY = [
  "applicants/ApplicantStageSheet",
  "applicants/ScreeningUploadSheet",
  "calendar/CalendarEventSheet",
  "insurance/MarketPremiumSheet",
  "insurance/PolicyForm",
  "leaseImport/LeaseImportBody",
  "leaseTemplates/LeaseTemplateFormScreen",
  "leaseTemplates/PlaceholderFormScreen",
  "leases/ExtendLeaseSheet",
  "listings/ChannelListingFormScreen",
  "listings/ListingFormScreen",
  "listings/ListingLinkFormScreen",
  "members/InviteSheet",
  "more/MoreScreen",
  "mortgages/MortgageForm",
  "properties/PropertyFormScreen",
  "reconciliation/ReconciliationAddForm",
  "taxReturns/TaxFieldOverrideForm",
  "tenants/EndTenancySheet",
  "transactions/NewTransactionForm",
  "transactions/TransactionEditForm",
  "utilityPlans/MarketRateForm",
  "utilityPlans/UtilityPlanForm",
  "vendors/VendorFormScreen",
  "welcomeManuals/WelcomeManualEmailForm",
  "welcomeManuals/WelcomeManualFormScreen",
  "welcomeManuals/WelcomeManualSectionFormScreen",
];

// A bar pinned below the scroll view has to be lifted, so these keep a keyboard-avoiding view, given the header's height.
const PINNED_BAR = [
  "applicants/PromoteForm",
  "inquiries/InquiryReplyBody",
  "leases/AddDocumentForm",
  "newLease/NewLeaseForm",
  "replyTemplates/ReplyTemplateForm",
];

// Where each of those draws its pinned bar: the reply-template form leaves it to its variable bar.
const BAR_DRAWN_IN = [...PINNED_BAR.filter((feature) => feature !== "replyTemplates/ReplyTemplateForm"), "replyTemplates/ReplyTemplateVariableBar"];

function sourceOf(feature: string): string {
  return codeOf(join(FEATURES, `${feature}.tsx`));
}

const KEYBOARD_AWARE_SCROLL = /<KeyboardAwareScroll[\s>]/;

// Android draws edge to edge, so its window no longer shrinks for the keyboard, and automaticallyAdjustKeyboardInsets
// only works on iOS: the last fields stayed under the keyboard. KeyboardAwareScroll pads and scrolls on both, by where
// the field is on the screen, so a page sheet or a header above needs no offset. Under Jest it renders the library's
// mock, a ScrollView given the props, so the clearance only it sets shows which scroll view rendered.
function expectsScrollViewToTrackKeyboard(): void {
  const [outermost] = nodesOfType(screen.toJSON() as RenderedNode | null, "RCTScrollView");
  expect(outermost).toBeDefined();
  expect(outermost.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE);
  expect(outermost.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
}

describe("keyboard insets", () => {
  beforeEach(resetSignedInStore);

  it("a page sheet lets its scroll view track the keyboard", async () => {
    await renderScreen(<EndTenancySheet isOpen name="Sam" onClose={jest.fn()} onEnd={jest.fn()} />);
    expectsScrollViewToTrackKeyboard();
  });

  it("a form under a header lets its scroll view track the keyboard", async () => {
    await renderScreen(<VendorFormScreen original={null} />);
    expectsScrollViewToTrackKeyboard();
  });

  it("a tax-field form lets its scroll view track the keyboard", async () => {
    await renderScreen(<TaxFieldOverrideForm field={aTaxField()} returnId="r1" />);
    expectsScrollViewToTrackKeyboard();
  });

  it.each(SCROLL_ONLY)("%s tracks the keyboard with the shared keyboard-aware scroll view", (feature) => {
    const source = sourceOf(feature);
    expect(source).not.toContain("KeyboardAvoidingView");
    expect(source).toMatch(KEYBOARD_AWARE_SCROLL);
    expect(source).not.toMatch(/<ScrollView[\s>]/);
  });

  it.each(PINNED_BAR)("%s lifts its pinned bar by the header's height", (feature) => {
    const source = sourceOf(feature);
    expect(source).toMatch(/<HeaderKeyboardAvoidingView[\s>]/);
    expect(source).not.toMatch(/<KeyboardAvoidingView/);
    // The avoiding view already lifts everything above the keyboard; a keyboard-aware scroll inside would pad again.
    expect(source).not.toMatch(KEYBOARD_AWARE_SCROLL);
  });

  // The keyboard covers the home indicator, so a bar padded for it while the keyboard is up floats that far above it.
  it.each(BAR_DRAWN_IN)("%s drops its home-indicator padding as the keyboard opens", (feature) => {
    const source = sourceOf(feature);
    expect(source).toMatch(/<PinnedBar[\s>]/);
    expect(source).not.toContain("useSafeAreaInsets");
  });

  // Covers a bare KeyboardAvoidingView too, however it's reached.
  it("nothing in the app leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(join(__dirname, ".."), ["src", "app"])).toEqual([]);
  });
});

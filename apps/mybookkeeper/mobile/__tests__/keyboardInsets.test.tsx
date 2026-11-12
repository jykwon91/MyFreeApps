import { readdirSync, readFileSync } from "fs";
import { join } from "path";
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

/** The file's code with its comments taken out, so a mention in a comment can't satisfy or fail a check. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function sourceOf(feature: string): string {
  return codeOf(join(FEATURES, `${feature}.tsx`));
}

const TRACKS_KEYBOARD = /\bautomaticallyAdjustKeyboardInsets(?!=\{false\})/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// KeyboardAvoidingView pads by comparing the view's position in its parent with the keyboard's position on the
// screen. A page sheet or a screen under a header sits lower on the screen than in its parent, so the padding
// came up short by that gap and the last fields stayed under the keyboard. The scroll view measures itself
// natively instead, so it needs no offset.
function expectsScrollViewToTrackKeyboard(): void {
  const [outermost] = nodesOfType(screen.toJSON() as RenderedNode | null, "RCTScrollView");
  expect(outermost).toBeDefined();
  expect(outermost.props.automaticallyAdjustKeyboardInsets).toBe(true);
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

  it.each(SCROLL_ONLY)("%s tracks the keyboard on its scroll view, not with a keyboard-avoiding view", (feature) => {
    const source = sourceOf(feature);
    expect(source).not.toContain("KeyboardAvoidingView");
    expect(source).toMatch(TRACKS_KEYBOARD);
  });

  it.each(PINNED_BAR)("%s lifts its pinned bar by the header's height", (feature) => {
    const source = sourceOf(feature);
    expect(source).toMatch(/<HeaderKeyboardAvoidingView[\s>]/);
    expect(source).not.toMatch(/<KeyboardAvoidingView/);
    expect(source).not.toMatch(TRACKS_KEYBOARD);
  });

  it("nothing in the app uses a bare KeyboardAvoidingView", () => {
    const root = join(__dirname, "..");
    const offenders = [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "app"))].filter((path) => /\bKeyboardAvoidingView\b/.test(codeOf(path)));
    expect(offenders.map((path) => path.replace(root, ""))).toEqual([]);
  });
});

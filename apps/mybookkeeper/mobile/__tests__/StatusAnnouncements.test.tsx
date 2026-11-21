import type { WelcomeManualSendResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-send-response";
import type { FileForUpload } from "@platform/mobile";
import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { documentReaderMessages } from "../src/constants/documentReader";
import { MONEY_ANALYSIS_MESSAGES } from "../src/constants/moneyAnalysis";
import AiSuggestionsCard from "../src/features/leaseTemplates/AiSuggestionsCard";
import ComparisonNotice from "../src/features/analyticsControls/ComparisonNotice";
import DocumentLibraryPlaceholder from "../src/features/documentReader/DocumentLibraryPlaceholder";
import ListingPhotoUploadRow from "../src/features/listings/ListingPhotoUploadRow";
import PropertyMultiSheet from "../src/features/analyticsControls/PropertyMultiSheet";
import TransactionSelectionBar from "../src/features/transactions/TransactionSelectionBar";
import WelcomeManualEmailOutcome from "../src/features/welcomeManuals/WelcomeManualEmailOutcome";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
const POLITE = { queue: true };

beforeEach(() => jest.clearAllMocks());

/** These were live regions or alerts, which VoiceOver never reads; each now has the screen reader say it on iOS as well. */
describe("status messages a screen reader hears on both platforms", () => {
  it("ComparisonNotice reads the earlier stretch loading, then its failure as an alert", async () => {
    const notice = (props: { isLoading: boolean; hasFailed: boolean }) => <ComparisonNotice failedMessage="No comparison this time." onRetry={jest.fn()} {...props} />;
    await render(notice({ isLoading: true, hasFailed: false }));
    expect(announcePolitely).toHaveBeenCalledWith(MONEY_ANALYSIS_MESSAGES.loadingComparison, POLITE);

    await screen.rerender(notice({ isLoading: false, hasFailed: true }));
    expect(announcePolitely).toHaveBeenCalledWith("No comparison this time.", POLITE);
    expect(screen.getByRole("alert")).toHaveTextContent("No comparison this time.");
    expect(screen.getByRole("button", { name: MONEY_ANALYSIS_MESSAGES.retryComparison })).toBeTruthy();
  });

  it("PropertyMultiSheet reads the limit when a tap reaches it, and not when the sheet is opened at it", async () => {
    const properties = [{ id: "a", name: "Elm" }, { id: "b", name: "Oak" }];
    const sheet = (isOpen: boolean, selectedIds: string[]) => (
      <PropertyMultiSheet isOpen={isOpen} maxSelected={1} onChange={jest.fn()} onClose={jest.fn()} properties={properties} selectedIds={selectedIds} />
    );
    await render(sheet(true, []));
    await screen.rerender(sheet(true, ["a"]));
    expect(announcePolitely).toHaveBeenCalledWith(MONEY_ANALYSIS_MESSAGES.propertyLimit(1), POLITE);
    expect(announcePolitely).toHaveBeenCalledTimes(1);

    await screen.rerender(sheet(false, ["a"]));
    await screen.rerender(sheet(true, ["a"]));
    expect(announcePolitely).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
  });

  it("PropertyMultiSheet opened already at the limit shows it without reading it", async () => {
    await render(<PropertyMultiSheet isOpen maxSelected={1} onChange={jest.fn()} onClose={jest.fn()} properties={[{ id: "a", name: "Elm" }, { id: "b", name: "Oak" }]} selectedIds={["a"]} />);
    expect(screen.getByText(MONEY_ANALYSIS_MESSAGES.propertyLimit(1))).toBeTruthy();
    expect(announcePolitely).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("WelcomeManualEmailOutcome reads what happened to the email", async () => {
    const outcome: WelcomeManualSendResponse = { id: "s", manual_id: "m", recipient_email: "guest@example.com", recipient_name: null, status: "sent", error_reason: null, created_at: "2026-01-01T00:00:00Z" };
    await render(<WelcomeManualEmailOutcome manualId="m" onSendAnother={jest.fn()} onTryAgain={jest.fn()} outcome={outcome} />);
    expect(announcePolitely).toHaveBeenCalledWith(expect.stringMatching(/^Guide sent\. I sent the guide to guest@example\.com\./), POLITE);
  });

  it("TransactionSelectionBar reads the count as it changes", async () => {
    const bar = (selectedCount: number) => (
      <TransactionSelectionBar
        approvableCount={selectedCount}
        isApproving={false}
        isChecking={false}
        isDeleting={false}
        isMarking={false}
        isUnmarking={false}
        onApprove={jest.fn()}
        onCancel={jest.fn()}
        onDelete={jest.fn()}
        onMarkCapital={jest.fn()}
        onUnmarkCapital={jest.fn()}
        selectedCount={selectedCount}
      />
    );
    await render(bar(1));
    expect(announcePolitely).toHaveBeenCalledWith("1 selected", POLITE);
    await screen.rerender(bar(3));
    expect(announcePolitely).toHaveBeenCalledWith("3 selected", POLITE);
  });

  it("AiSuggestionsCard reads its headline", async () => {
    await render(<AiSuggestionsCard onDismiss={jest.fn()} savedKeys={new Set()} suggestions={{ suggestions: [], truncated: false, pages_note: null }} />);
    expect(announcePolitely).toHaveBeenCalledWith(screen.getByRole("header").props.children, POLITE);
  });

  it("DocumentLibraryPlaceholder reads the failure through the shared SectionError", async () => {
    const messages = documentReaderMessages({ title: "t", hint: "h", takePhoto: "p", target: "form" });
    await render(<DocumentLibraryPlaceholder failed isFetching={false} messages={messages} onRetry={jest.fn()} />);
    expect(announcePolitely).toHaveBeenCalledWith(messages.libraryFailed, POLITE);
    expect(screen.getByRole("button", { name: messages.libraryRetry })).toBeTruthy();
  });

  it("ListingPhotoUploadRow reads a failed photo's problem once, from its Banner, and leaves progress to the batch line", async () => {
    const file: FileForUpload = { uri: "file:///a.jpg", name: "a.jpg", mimeType: "image/jpeg" };
    await render(<ListingPhotoUploadRow onDiscard={jest.fn()} onRetry={jest.fn()} position={1} upload={{ key: "k", file, status: "failed", problem: "Too big." }} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Too big.");

    await screen.rerender(<ListingPhotoUploadRow onDiscard={jest.fn()} onRetry={jest.fn()} position={1} upload={{ key: "k", file, status: "sending", problem: null }} />);
    expect(announcePolitely).not.toHaveBeenCalled();
  });
});

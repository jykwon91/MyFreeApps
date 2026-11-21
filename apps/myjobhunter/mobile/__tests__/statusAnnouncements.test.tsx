import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { ADD_APPLICATION_MESSAGES } from "../src/constants/addApplication";
import { COMPANY_RESEARCH_MESSAGES } from "../src/constants/companyResearch";
import ReadingHint from "../src/features/addApplication/ReadingHint";
import ResearchBody from "../src/features/companyDetail/ResearchBody";
import ResearchFailed from "../src/features/companyDetail/ResearchFailed";

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
const POLITE = { queue: true };

beforeEach(() => jest.clearAllMocks());

/** These were live regions or alerts, which VoiceOver never reads; each now has the screen reader say it on iOS as well. */
describe("status messages a screen reader hears on both platforms", () => {
  it("ResearchBody reads the running note while research runs", async () => {
    await render(<ResearchBody companyName="Acme" failure={null} isRunning mode="loading" onRun={jest.fn()} research={undefined} />);
    expect(announcePolitely).toHaveBeenCalledWith(COMPANY_RESEARCH_MESSAGES.runningNote("Acme"), POLITE);
  });

  it("ResearchFailed reads why the research failed, as an alert", async () => {
    await render(<ResearchFailed failure={{ reason: "retryable", detail: null }} isRunning={false} onRun={jest.fn()} />);
    expect(announce).toHaveBeenCalledWith(screen.getByRole("alert").props.children);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("ReadingHint reads that a slow read is still going, and nothing before then", async () => {
    await render(<ReadingHint isLongRunning={false} />);
    expect(announcePolitely).not.toHaveBeenCalled();
    await screen.rerender(<ReadingHint isLongRunning />);
    expect(announcePolitely).toHaveBeenCalledWith(ADD_APPLICATION_MESSAGES.longRunning, POLITE);
  });
});

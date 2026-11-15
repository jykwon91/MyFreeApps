/**
 * The dialogs refuse what the server refuses, and say which field, before sending.
 *
 * Verifies:
 * - Nothing is shown until a save was tried
 * - A rate above the server's ceiling, a term ending before it starts and a
 *   speed above the ceiling are each named on their field and send nothing
 * - The message is tied to its control with aria-invalid / aria-describedby
 * - Fixing the figures lets the same dialog save
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddUtilityPlanDialog from "@/app/features/utility/AddUtilityPlanDialog";

const mockCreate = vi.fn();

vi.mock("@mybookkeeper/api-client/store/utilityPlansApi", () => ({
  useCreateUtilityPlanMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
  useExtractUtilityPlanMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useExtractUtilityPlanFromUploadMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [{ id: "prop-1", name: "6734 Peerless St" }] })),
}));
vi.mock("@mybookkeeper/api-client/store/documentsApi", () => ({
  useGetDocumentsQuery: vi.fn(() => ({ data: [] })),
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId("utility-plan-property-select"), "prop-1");
  await user.type(screen.getByTestId("utility-plan-provider-input"), "Reliant");
}

describe("utility plan form checks", () => {
  it("shows nothing before a save is tried", async () => {
    const user = userEvent.setup();
    render(<AddUtilityPlanDialog onClose={vi.fn()} />);
    await user.type(screen.getByTestId("utility-plan-energy-input"), "1500");
    expect(screen.queryByTestId("utility-plan-energyCharge-problem")).toBeNull();
  });

  it("refuses a rate above the ceiling, ties the message to the field, and sends nothing", async () => {
    const user = userEvent.setup();
    render(<AddUtilityPlanDialog onClose={vi.fn()} />);
    await fillBasics(user);
    await user.type(screen.getByTestId("utility-plan-energy-input"), "1500");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(await screen.findByTestId("utility-plan-energyCharge-problem")).toHaveTextContent("cents");
    const input = screen.getByTestId("utility-plan-energy-input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "utility-plan-energyCharge-problem");
    expect(mockCreate).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "15");
    await user.click(screen.getByTestId("utility-plan-save-button"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  });

  it("refuses a term that ends before the service starts", async () => {
    const user = userEvent.setup();
    render(<AddUtilityPlanDialog onClose={vi.fn()} />);
    await fillBasics(user);
    await user.type(screen.getByTestId("utility-plan-start-date-input"), "2026-02-01");
    await user.type(screen.getByTestId("utility-plan-end-date-input"), "2026-01-01");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(await screen.findByTestId("utility-plan-termEndDate-problem")).toHaveTextContent("can't end before");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses an internet speed above the ceiling", async () => {
    const user = userEvent.setup();
    render(<AddUtilityPlanDialog onClose={vi.fn()} />);
    await fillBasics(user);
    await user.selectOptions(screen.getByTestId("utility-plan-service-select"), "internet");
    await user.type(screen.getByTestId("utility-plan-download-input"), "1000000");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(await screen.findByTestId("utility-plan-downloadMbps-problem")).toHaveTextContent("Mbps");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

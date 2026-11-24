import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import PropertyValueEditor from "@/app/features/net-worth/PropertyValueEditor";
import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { MONEY_INPUT_MESSAGES } from "@mybookkeeper/api-client/constants/moneyInput";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

const setValue = vi.fn();
vi.mock("@mybookkeeper/api-client/store/netWorthApi", () => ({
  useSetPropertyEstimatedValueMutation: () => [setValue, { isLoading: false }],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const HOUSE: NetWorthLine = {
  source: "property", id: "p1", name: "Elm St", detail: null, amount_cents: null,
  currency: "USD", as_of: null, is_stale: false, in_total: false,
};

beforeEach(() => {
  setValue.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("PropertyValueEditor", () => {
  it("starts empty for a property without a value and offers nothing to remove", () => {
    render(<PropertyValueEditor line={HOUSE} onDone={vi.fn()} />);
    expect(screen.getByTestId("property-value-input")).toHaveValue("");
    expect(screen.queryByTestId("property-value-remove")).not.toBeInTheDocument();
  });

  it("refuses a blank value and sends nothing", async () => {
    render(<PropertyValueEditor line={HOUSE} onDone={vi.fn()} />);
    await userEvent.click(screen.getByTestId("property-value-save"));
    expect(screen.getByTestId("property-value-hint")).toHaveTextContent(MONEY_INPUT_MESSAGES.notPositive);
    expect(setValue).not.toHaveBeenCalled();
  });

  it("saves the typed dollars as cents, confirms and closes", async () => {
    setValue.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const onDone = vi.fn();
    render(<PropertyValueEditor line={HOUSE} onDone={onDone} />);
    await userEvent.type(screen.getByTestId("property-value-input"), "$412,500");
    await userEvent.click(screen.getByTestId("property-value-save"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setValue).toHaveBeenCalledWith({ propertyId: "p1", data: { estimated_value_cents: 41_250_000 } });
    expect(showSuccess).toHaveBeenCalledWith(MSG.valueSaved);
  });

  it("removes an existing value", async () => {
    setValue.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const onDone = vi.fn();
    render(<PropertyValueEditor line={{ ...HOUSE, amount_cents: 30_000_000, as_of: "2026-11-01" }} onDone={onDone} />);
    expect(screen.getByTestId("property-value-input")).toHaveValue("300000");
    await userEvent.click(screen.getByTestId("property-value-remove"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setValue).toHaveBeenCalledWith({ propertyId: "p1", data: { estimated_value_cents: null } });
    expect(showSuccess).toHaveBeenCalledWith(MSG.valueRemoved);
  });

  it("stays open and says why when the save fails", async () => {
    setValue.mockReturnValue({ unwrap: () => Promise.reject({ status: 500 }) });
    const onDone = vi.fn();
    render(<PropertyValueEditor line={HOUSE} onDone={onDone} />);
    await userEvent.type(screen.getByTestId("property-value-input"), "1000");
    await userEvent.click(screen.getByTestId("property-value-save"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.valueSaveFailed));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("property-value-save")).not.toBeDisabled();
  });
});

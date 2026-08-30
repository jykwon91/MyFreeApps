import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import RentScheduleForm from "@/app/features/rent/RentScheduleForm";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();

vi.mock("@/shared/store/rentLedgerApi", () => ({
  useCreateRentScheduleMutation: () => [mockCreate, { isLoading: false }],
  useUpdateRentScheduleMutation: () => [mockUpdate, { isLoading: false }],
  useDeleteRentScheduleMutation: () => [mockRemove, { isLoading: false }],
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { showError, showSuccess } from "@/shared/lib/toast-store";

const EXISTING: RentSchedule = {
  id: "sch-1",
  applicant_id: "app-1",
  property_id: null,
  amount: "1500.00",
  cadence: "monthly",
  start_date: "2026-08-01",
  end_date: null,
  grace_days: null,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

function renderForm(existing: RentSchedule | null, onSaved = vi.fn()) {
  render(
    <Provider store={store}>
      <RentScheduleForm
        applicantId="app-1"
        existing={existing}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    </Provider>,
  );
  return onSaved;
}

describe("RentScheduleForm", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockRemove.mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
  });

  it("creates a monthly schedule from the amount, cadence and start date", async () => {
    mockCreate.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    const onSaved = renderForm(null);

    fireEvent.change(screen.getByTestId("rent-schedule-amount"), {
      target: { value: "1500.00" },
    });
    fireEvent.change(screen.getByTestId("rent-schedule-start"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.click(screen.getByTestId("rent-schedule-save-button"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        applicant_id: "app-1",
        amount: "1500.00",
        cadence: "monthly",
        start_date: "2026-08-01",
        end_date: null,
        grace_days: null,
        notes: null,
      });
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("warns that a mid-month monthly start will be prorated", () => {
    renderForm(null);
    expect(screen.getByTestId("rent-schedule-start-hint")).toHaveTextContent(
      "Rent falls due on the 1st. Starting mid-month bills a prorated first period",
    );
  });

  it("describes weekly periods as tiling from the start day, not the calendar", () => {
    renderForm(null);
    fireEvent.change(screen.getByTestId("rent-schedule-cadence"), {
      target: { value: "weekly" },
    });
    expect(screen.getByTestId("rent-schedule-start-hint")).toHaveTextContent(
      "Weeks are counted from this day",
    );
  });

  it("blocks submission until an amount and start date are entered", () => {
    renderForm(null);
    expect(screen.getByTestId("rent-schedule-save-button")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rent-schedule-amount"), {
      target: { value: "1500.00" },
    });
    expect(screen.getByTestId("rent-schedule-save-button")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rent-schedule-start"), {
      target: { value: "2026-08-01" },
    });
    expect(screen.getByTestId("rent-schedule-save-button")).toBeEnabled();
  });

  it("surfaces the server's reason when a schedule overlaps an existing one", async () => {
    mockCreate.mockReturnValueOnce({
      unwrap: () =>
        Promise.reject({ data: { detail: "Overlaps an existing schedule" } }),
    });
    const onSaved = renderForm(null);

    fireEvent.change(screen.getByTestId("rent-schedule-amount"), {
      target: { value: "1500.00" },
    });
    fireEvent.change(screen.getByTestId("rent-schedule-start"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.click(screen.getByTestId("rent-schedule-save-button"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Overlaps an existing schedule");
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows amount and cadence as fixed text when amending, with the reason why", () => {
    renderForm(EXISTING);
    const fixed = screen.getByTestId("rent-schedule-fixed-terms");
    expect(fixed).toHaveTextContent("$1,500.00");
    expect(fixed).toHaveTextContent("monthly, starting August 1, 2026");
    expect(fixed).toHaveTextContent("end this schedule and add a new one");
    expect(screen.queryByTestId("rent-schedule-amount")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rent-schedule-cadence")).not.toBeInTheDocument();
  });

  it("ends a tenancy by patching only the fields the backend accepts", async () => {
    mockUpdate.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderForm(EXISTING);

    fireEvent.change(screen.getByTestId("rent-schedule-end"), {
      target: { value: "2026-08-15" },
    });
    fireEvent.click(screen.getByTestId("rent-schedule-save-button"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        scheduleId: "sch-1",
        applicantId: "app-1",
        end_date: "2026-08-15",
        grace_days: null,
        notes: null,
      });
    });
  });

  it("sends an explicit null when an end date is cleared, so the tenancy reopens", async () => {
    mockUpdate.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderForm({ ...EXISTING, end_date: "2026-08-15" });

    fireEvent.change(screen.getByTestId("rent-schedule-end"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("rent-schedule-save-button"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ end_date: null }),
      );
    });
  });

  it("offers removal only on an existing schedule", () => {
    renderForm(null);
    expect(
      screen.queryByTestId("rent-schedule-remove-button"),
    ).not.toBeInTheDocument();
  });

  it("removes a schedule entered by mistake", async () => {
    mockRemove.mockReturnValueOnce({ unwrap: () => Promise.resolve(undefined) });
    const onSaved = renderForm(EXISTING);

    fireEvent.click(screen.getByTestId("rent-schedule-remove-button"));

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({
        scheduleId: "sch-1",
        applicantId: "app-1",
      });
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import ReconciliationWizard from "@/app/features/reconciliation/ReconciliationWizard";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@platform/core/lib/api", () => ({ default: request }));

function renderWizard() {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReconciliationWizard onToast={vi.fn()} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ReconciliationWizard accessibility", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: [] });
  });

  it("names the tax year picker", () => {
    renderWizard();
    expect(screen.getByRole("combobox", { name: "Tax year" })).toBeInTheDocument();
  });

  it("marks the current step and moves the mark when another step is chosen", async () => {
    renderWizard();
    const steps = screen.getByRole("navigation", { name: "Reconciliation steps" });
    const upload = screen.getByRole("button", { name: "Upload 1099" });
    const review = screen.getByRole("button", { name: "Review Sources" });
    expect(steps).toContainElement(upload);
    expect(upload).toHaveAttribute("aria-current", "step");
    expect(review).not.toHaveAttribute("aria-current");

    await userEvent.click(review);

    expect(review).toHaveAttribute("aria-current", "step");
    expect(upload).not.toHaveAttribute("aria-current");
  });

  it("announces the step and labels its content", async () => {
    renderWizard();
    expect(screen.getByText("Step 1 of 3: Upload 1099")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("region", { name: "Upload 1099" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Discrepancies" }));

    expect(screen.getByText("Step 3 of 3: Discrepancies")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Discrepancies" })).toBeInTheDocument();
  });

  it("ties each 1099 field to its label", () => {
    renderWizard();
    expect(screen.getByLabelText("Source Type")).toHaveValue("1099_k");
    expect(screen.getByLabelText("Issuer")).toHaveAttribute("placeholder", "e.g. Airbnb");
    expect(screen.getByLabelText("Reported Amount")).toHaveAttribute("type", "number");
  });
});

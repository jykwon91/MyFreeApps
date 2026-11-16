import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import ReconciliationWizard from "@/app/features/reconciliation/ReconciliationWizard";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@platform/core/lib/api", () => ({ default: request }));

const onToast = vi.fn();

function renderWizard() {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReconciliationWizard onToast={onToast} />
      </MemoryRouter>
    </Provider>,
  );
}

function uploads() {
  return request.mock.calls.filter(([config]) => config.method === "POST");
}

describe("1099 reported amount", () => {
  beforeEach(() => {
    request.mockReset();
    onToast.mockReset();
    request.mockResolvedValue({ data: [] });
  });

  it.each([
    ["", "Enter the amount reported on the 1099."],
    ["-5", "Enter an amount of $0 or more."],
    ["12.345", "Use dollars and cents, like 84.20."],
    ["10000000000", "That amount is too large."],
  ])("refuses %j with a field error and sends nothing", async (value, message) => {
    renderWizard();
    const amount = screen.getByLabelText("Reported Amount");
    if (value) await userEvent.type(amount, value);

    await userEvent.click(screen.getByRole("button", { name: "Add 1099 Source" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(uploads()).toHaveLength(0);
  });

  it("sends the amount exactly as typed once it is fixed", async () => {
    renderWizard();
    const amount = screen.getByLabelText("Reported Amount");
    await userEvent.type(amount, "12.345");
    await userEvent.click(screen.getByRole("button", { name: "Add 1099 Source" }));
    await screen.findByRole("alert");

    await userEvent.clear(amount);
    await userEvent.type(amount, "84.5");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 1099 Source" }));

    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0][0].data).toMatchObject({ reported_amount: "84.5" });
  });

  it("shows the server's reason when it refuses the amount", async () => {
    request.mockImplementation(async (config: { method?: string }) => {
      if (config.method === "POST") throw { response: { status: 422, data: { detail: "That amount is too large." } } };
      return { data: [] };
    });
    renderWizard();
    await userEvent.type(screen.getByLabelText("Reported Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add 1099 Source" }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith("That amount is too large.", "error"));
  });
});

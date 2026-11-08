import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import ApplicantContactEmailEditor from "@/app/features/applicants/ApplicantContactEmailEditor";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@platform/core/lib/api", () => ({ default: request }));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { showError, showSuccess } from "@platform/ui";

function renderEditor(email: string | null, canWrite = true) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <ApplicantContactEmailEditor applicantId="app-1" email={email} canWrite={canWrite} />
    </Provider>,
  );
}

function sentBody() {
  const call = request.mock.calls.find(([args]) => args.url === "/applicants/app-1/contact-email");
  return call?.[0];
}

describe("ApplicantContactEmailEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue({ data: {} });
  });

  it("adds an email when there is none and shows it afterwards", async () => {
    renderEditor(null);
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    await userEvent.type(screen.getByLabelText("Email"), "  ann@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Email saved"));
    expect(sentBody()).toMatchObject({ method: "PATCH", data: { contact_email: "ann@example.com" } });
    const link = screen.getByRole("link", { name: "ann@example.com" });
    expect(link).toHaveAttribute("href", "mailto:ann%40example.com");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toBe("mailto:ann@example.com");
    expect(screen.getByRole("button", { name: "Change email" })).toBeInTheDocument();
  });

  it("removes the email when the field is cleared", async () => {
    renderEditor("old@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Change email" }));
    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Email removed"));
    expect(sentBody()?.data).toEqual({ contact_email: null });
    expect(screen.getByTestId("sensitive-contact-email")).toHaveTextContent("—");
  });

  it("says plainly when the server rejects the address and keeps the edit open", async () => {
    request.mockRejectedValue({ response: { status: 422, data: { detail: [{ msg: "value is not a valid email address" }] } } });
    renderEditor(null);
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    await userEvent.type(screen.getByLabelText("Email"), "ann@example");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That doesn't look like an email address.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(showError).not.toHaveBeenCalled();
  });

  it("reports other failures and keeps the old address", async () => {
    request.mockRejectedValue({ response: { status: 500, data: {} } });
    renderEditor("old@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Change email" }));
    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("I couldn't save that email. Want to try again?"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("link", { name: "old@example.com" })).toBeInTheDocument();
  });

  it("locks the form while saving", async () => {
    let finish: (value: unknown) => void = () => undefined;
    request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderEditor(null);
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    finish({ data: {} });
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
  });

  it("offers no edit to read-only members", () => {
    renderEditor("old@example.com", false);
    expect(screen.getByRole("link", { name: "old@example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /email/i })).not.toBeInTheDocument();
  });
});

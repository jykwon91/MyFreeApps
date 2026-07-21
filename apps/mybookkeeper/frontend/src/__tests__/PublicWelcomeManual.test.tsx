/**
 * Tests for the public, unauthenticated welcome-manual guide page.
 *
 * Covers:
 * - Gate 200 shows the PIN form.
 * - Gate 404 (or any gate failure) shows the "not active" state.
 * - Wrong PIN (401) shows an inline error and clears the field.
 * - Rate-limited (429) shows the rate-limit message.
 * - Correct PIN renders the read-only preview + Where to Eat directory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicWelcomeManual from "@/app/pages/PublicWelcomeManual";

vi.mock("@/shared/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from "@/shared/lib/api";

const mockManual = {
  title: "Lakeview Welcome Guide",
  sections: [
    {
      title: "Wi-Fi",
      body: "Network: Lakeview, Password: guest1234",
      fields: [{ label: "Wi-Fi network", value: "Lakeview" }],
      images: [],
    },
  ],
  places: [
    {
      name: "Taco Spot",
      cuisine: "Mexican",
      price_tier: "$",
      note: "Great al pastor",
      map_url: null,
      display_order: 0,
    },
  ],
};

function renderPage(token = "tok-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/guide/${token}`]}>
      <Routes>
        <Route path="/guide/:token" element={<PublicWelcomeManual />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicWelcomeManual — gate", () => {
  it("shows the PIN form when the gate check succeeds", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { requires_pin: true } });
    renderPage();
    expect(await screen.findByTestId("public-welcome-manual-pin-form")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/public/welcome-manuals/tok-abc123");
  });

  it("shows the not-active state when the gate check 404s", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 404 } });
    renderPage("unknown-token");
    expect(await screen.findByTestId("public-welcome-manual-not-active")).toBeInTheDocument();
    expect(screen.getByText(/isn't active/i)).toBeInTheDocument();
  });
});

describe("PublicWelcomeManual — unlock", () => {
  it("shows an inline error and clears the field on a wrong PIN", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { requires_pin: true } });
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 401 } });
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("public-welcome-manual-pin-form");
    const input = screen.getByTestId("public-welcome-manual-pin-input");
    await user.type(input, "0000");
    await user.click(screen.getByTestId("public-welcome-manual-pin-submit"));

    expect(await screen.findByTestId("public-welcome-manual-pin-error")).toHaveTextContent(
      /Incorrect code/i,
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("shows a rate-limit message on 429", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { requires_pin: true } });
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 429 } });
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("public-welcome-manual-pin-form");
    await user.type(screen.getByTestId("public-welcome-manual-pin-input"), "1234");
    await user.click(screen.getByTestId("public-welcome-manual-pin-submit"));

    expect(await screen.findByTestId("public-welcome-manual-pin-error")).toHaveTextContent(
      /Too many attempts/i,
    );
  });

  it("renders the read-only preview and Where to Eat directory on a correct PIN", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { requires_pin: true } });
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockManual });
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("public-welcome-manual-pin-form");
    await user.type(screen.getByTestId("public-welcome-manual-pin-input"), "4321");
    await user.click(screen.getByTestId("public-welcome-manual-pin-submit"));

    expect(await screen.findByTestId("welcome-manual-preview")).toBeInTheDocument();
    expect(screen.getByText("Lakeview Welcome Guide")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-place-directory")).toBeInTheDocument();
    expect(screen.getByText("Taco Spot")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/public/welcome-manuals/tok-abc123/unlock", {
      pin: "4321",
    });
  });
});

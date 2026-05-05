/**
 * Tests for the public inquiry form (T0).
 *
 * Covers:
 * - Listing fetched and rendered (title, rent, room type)
 * - Form-loaded-at timestamp captured at mount
 * - Honeypot field is in the DOM but visually hidden
 * - Submit button disabled until required fields are filled
 * - Successful submit → success view
 * - 400 from backend renders generic error
 * - Listing 404 renders "Listing not found"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicInquiryForm from "@/app/pages/PublicInquiryForm";

vi.mock("@/shared/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) => {
    if (typeof err === "object" && err !== null) {
      const obj = err as Record<string, unknown>;
      if (typeof obj.data === "object" && obj.data !== null) {
        const data = obj.data as Record<string, unknown>;
        if (typeof data.detail === "string") return data.detail;
      }
    }
    return "Something went wrong";
  },
}));

vi.mock("@/shared/components/ui/TurnstileWidget", () => ({
  default: () => null,
}));

import api from "@/shared/lib/api";

const mockListing = {
  slug: "master-bedroom-abc123",
  title: "Master Bedroom in Houston",
  description: "Cozy room near the medical center.",
  monthly_rate: "1500.00",
  room_type: "private_room",
  private_bath: true,
  parking_assigned: true,
  furnished: true,
  pets_on_premises: false,
};

function renderForm(slug = "master-bedroom-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/apply/${slug}`]}>
      <Routes>
        <Route path="/apply/:slug" element={<PublicInquiryForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicInquiryForm — listing rendering", () => {
  it("renders listing title and rate", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    renderForm();
    expect(await screen.findByText(/Master Bedroom in Houston/)).toBeInTheDocument();
    expect(screen.getByText(/\$1500.00\/mo/)).toBeInTheDocument();
  });

  it("renders 'Listing not found' on 404", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("404"));
    renderForm("does-not-exist");
    expect(await screen.findByText(/Listing not found/)).toBeInTheDocument();
  });

  it("requests the public listing endpoint with the slug from the URL", async () => {
    // Regression guard: the axios baseURL is "/api", so the frontend must
    // call `/listings/public/<slug>` (NOT `/api/listings/public/<slug>`).
    // Caddy strips the leading `/api` segment before requests reach the
    // backend; re-introducing `/api/` here would 404 in production.
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    renderForm("master-bedroom-abc123");
    await screen.findByText(/Master Bedroom in Houston/);
    expect(api.get).toHaveBeenCalledWith("/listings/public/master-bedroom-abc123");
  });
});

describe("PublicInquiryForm — honeypot", () => {
  it("renders the honeypot field as visually hidden but real", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    renderForm();
    const honeypot = await screen.findByTestId("public-inquiry-honeypot");
    expect(honeypot).toBeInTheDocument();
    expect(honeypot).toHaveAttribute("name", "website");
    // Wrapper is positioned off-screen
    const wrapper = honeypot.closest("div");
    expect(wrapper?.style.position).toBe("absolute");
    expect(wrapper?.style.left).toContain("-10000");
  });
});

describe("PublicInquiryForm — submit gating", () => {
  it("submit is disabled until required fields are filled", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    renderForm();
    const submit = await screen.findByTestId("public-inquiry-submit");
    expect(submit).toBeDisabled();
  });

  it("successful POST shows the thanks view", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { status: "received" },
    });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");

    await user.type(screen.getByTestId("public-inquiry-name"), "Alice Smith");
    await user.type(screen.getByTestId("public-inquiry-email"), "alice@example.com");
    await user.type(screen.getByTestId("public-inquiry-phone"), "555-123-4567");
    // Use a date 30 days out
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().slice(0, 10);
    await user.type(screen.getByTestId("public-inquiry-move-in"), futureIso);
    // Lease length already defaults to empty — fill it
    const lease = screen.getByTestId("public-inquiry-lease-length");
    await user.clear(lease);
    await user.type(lease, "6");
    await user.click(screen.getByTestId("public-inquiry-pets-no"));
    await user.type(screen.getByTestId("public-inquiry-city"), "Austin, TX");
    await user.selectOptions(screen.getByTestId("public-inquiry-employment"), "employed");
    await user.type(
      screen.getByTestId("public-inquiry-why"),
      "I'm a travel nurse on assignment at the medical center.",
    );

    const submit = screen.getByTestId("public-inquiry-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    expect(await screen.findByText(/Thanks!/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/inquiries/public",
      expect.objectContaining({
        listing_slug: "master-bedroom-abc123",
        name: "Alice Smith",
        email: "alice@example.com",
        has_pets: false,
        employment_status: "employed",
      }),
    );
  });

  it("renders the friendly tell-more error from the backend", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      data: { detail: "Please tell us a bit more about why you're interested." },
    });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");

    await user.type(screen.getByTestId("public-inquiry-name"), "Alice");
    await user.type(screen.getByTestId("public-inquiry-email"), "a@b.com");
    await user.type(screen.getByTestId("public-inquiry-phone"), "555-123-4567");
    const future = new Date();
    future.setDate(future.getDate() + 30);
    await user.type(
      screen.getByTestId("public-inquiry-move-in"),
      future.toISOString().slice(0, 10),
    );
    const lease = screen.getByTestId("public-inquiry-lease-length");
    await user.clear(lease);
    await user.type(lease, "6");
    await user.click(screen.getByTestId("public-inquiry-pets-no"));
    await user.type(screen.getByTestId("public-inquiry-city"), "Austin");
    await user.selectOptions(screen.getByTestId("public-inquiry-employment"), "employed");
    await user.type(
      screen.getByTestId("public-inquiry-why"),
      "Because I want to live there with my family for a few months while I work nearby",
    );

    const submit = screen.getByTestId("public-inquiry-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    expect(await screen.findByTestId("public-inquiry-error")).toHaveTextContent(
      /tell us a bit more/i,
    );
  });
});

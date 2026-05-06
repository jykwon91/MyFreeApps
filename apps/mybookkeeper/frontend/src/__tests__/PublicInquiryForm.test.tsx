/**
 * Tests for the public inquiry form.
 *
 * Covers:
 * - Listing fetched and rendered (title, rent, room type)
 * - Listing 404 renders "Listing not found"
 * - Honeypot field is in the DOM but visually hidden
 * - Submit on empty form surfaces inline + summary errors and does NOT POST
 * - Inline error appears on blur with invalid input
 * - whyThisRoom under 30 chars shows precise remaining-characters error
 * - Fixing a field clears its error
 * - Successful submit → success view
 * - 400 from backend renders generic error
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

function futureDateIso(daysFromNow = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("public-inquiry-name"), "Alice Smith");
  await user.type(screen.getByTestId("public-inquiry-email"), "alice@example.com");
  await user.type(screen.getByTestId("public-inquiry-phone"), "555-123-4567");
  await user.type(screen.getByTestId("public-inquiry-move-in"), futureDateIso());
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
    const wrapper = honeypot.closest("div");
    expect(wrapper?.style.position).toBe("absolute");
    expect(wrapper?.style.left).toContain("-10000");
  });
});

describe("PublicInquiryForm — validation UX", () => {
  it("clicking submit on an empty form surfaces inline + summary errors and does not POST", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");
    const submit = screen.getByTestId("public-inquiry-submit");
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    expect(await screen.findByTestId("public-inquiry-summary")).toHaveTextContent(
      /Please fix \d+ issues below/,
    );
    expect(screen.getByTestId("public-inquiry-name-error")).toHaveTextContent(
      /Please enter your name/,
    );
    expect(screen.getByTestId("public-inquiry-email-error")).toHaveTextContent(
      /Please enter your email/,
    );
    expect(screen.getByTestId("public-inquiry-why-error")).toHaveTextContent(
      /Please tell us why you're interested/,
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows precise remaining-characters error when whyThisRoom is too short", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");
    // 28 characters — 2 short of the 30-char minimum.
    await user.type(
      screen.getByTestId("public-inquiry-why"),
      "lookingh gor a place to stay",
    );
    await user.click(screen.getByTestId("public-inquiry-submit"));

    expect(await screen.findByTestId("public-inquiry-why-error")).toHaveTextContent(
      /Please add 2 more characters \(minimum 30\)/,
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows an inline error on blur with invalid input", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");
    const email = screen.getByTestId("public-inquiry-email");
    await user.type(email, "not-an-email");
    await user.tab(); // blur

    expect(await screen.findByTestId("public-inquiry-email-error")).toHaveTextContent(
      /valid email address/,
    );
    // Other untouched fields don't show errors yet.
    expect(screen.queryByTestId("public-inquiry-name-error")).not.toBeInTheDocument();
  });

  it("clears a field's error once the user fixes the value", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");
    await user.click(screen.getByTestId("public-inquiry-submit"));
    expect(await screen.findByTestId("public-inquiry-name-error")).toBeInTheDocument();

    await user.type(screen.getByTestId("public-inquiry-name"), "Alice");
    await waitFor(() =>
      expect(screen.queryByTestId("public-inquiry-name-error")).not.toBeInTheDocument(),
    );
  });
});

describe("PublicInquiryForm — submit", () => {
  it("successful POST shows the thanks view", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockListing });
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { status: "received" },
    });
    const user = userEvent.setup();
    renderForm();

    await screen.findByTestId("public-inquiry-form");
    await fillValidForm(user);
    await user.click(screen.getByTestId("public-inquiry-submit"));

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
    await fillValidForm(user);
    // Replace the why field with longer text so client-side validation passes.
    const why = screen.getByTestId("public-inquiry-why");
    await user.clear(why);
    await user.type(
      why,
      "Because I want to live there with my family for a few months while I work nearby",
    );
    await user.click(screen.getByTestId("public-inquiry-submit"));

    expect(await screen.findByTestId("public-inquiry-error")).toHaveTextContent(
      /tell us a bit more/i,
    );
  });
});

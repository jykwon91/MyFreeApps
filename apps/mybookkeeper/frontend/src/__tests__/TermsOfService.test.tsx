import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import TermsOfService, { TERMS_LAST_UPDATED } from "@/app/pages/TermsOfService";

function renderTermsOfService() {
  return render(
    <BrowserRouter>
      <TermsOfService />
    </BrowserRouter>,
  );
}

describe("TermsOfService — rendering", () => {
  it("renders the page heading", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /terms of service/i })).toBeInTheDocument();
  });

  it("renders the last-updated date", () => {
    renderTermsOfService();
    expect(screen.getByText(new RegExp(TERMS_LAST_UPDATED))).toBeInTheDocument();
  });

  it("renders the Acceptance section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /acceptance/i })).toBeInTheDocument();
  });

  it("renders the The service section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /the service/i })).toBeInTheDocument();
  });

  it("renders the Your account section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /your account/i })).toBeInTheDocument();
  });

  it("renders the Acceptable use section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /acceptable use/i })).toBeInTheDocument();
  });

  it("renders the Intellectual property section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /intellectual property/i })).toBeInTheDocument();
  });

  it("renders the Termination section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /termination/i })).toBeInTheDocument();
  });

  it("renders the Disclaimers section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /disclaimers/i })).toBeInTheDocument();
  });

  it("renders the Limitation of liability section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /limitation of liability/i })).toBeInTheDocument();
  });

  it("renders the Governing law section", () => {
    renderTermsOfService();
    expect(screen.getByRole("heading", { name: /governing law/i })).toBeInTheDocument();
  });

  it("renders the Changes section", () => {
    renderTermsOfService();
    expect(screen.getAllByRole("heading", { name: /changes/i }).length).toBeGreaterThan(0);
  });

  it("renders the contact email", () => {
    renderTermsOfService();
    expect(screen.getAllByText(/jasonykwon91@gmail\.com/i).length).toBeGreaterThan(0);
  });

  it("renders an anchor link for the contact email", () => {
    renderTermsOfService();
    const links = screen.getAllByRole("link");
    const mailtoLink = links.find(
      (l) => l.getAttribute("href") === "mailto:jasonykwon91@gmail.com",
    );
    expect(mailtoLink).toBeDefined();
  });
});

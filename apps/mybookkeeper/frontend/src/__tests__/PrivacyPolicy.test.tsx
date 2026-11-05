import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import PrivacyPolicy, { PRIVACY_LAST_UPDATED } from "@/app/pages/PrivacyPolicy";

function renderPrivacyPolicy() {
  return render(
    <BrowserRouter>
      <PrivacyPolicy />
    </BrowserRouter>,
  );
}

describe("PrivacyPolicy — rendering", () => {
  it("renders the page heading", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument();
  });

  it("renders the last-updated date", () => {
    renderPrivacyPolicy();
    expect(screen.getByText(new RegExp(PRIVACY_LAST_UPDATED))).toBeInTheDocument();
  });

  it("says the phone app asks before sending documents to Anthropic", () => {
    renderPrivacyPolicy();
    expect(screen.getByText(/The phone app asks your permission before sending any/)).toBeInTheDocument();
  });

  it("names every kind of content sent to Anthropic", () => {
    renderPrivacyPolicy();
    expect(screen.getByText(/Gmail emails and attachments/)).toBeInTheDocument();
    expect(screen.getByText(/Mortgage statements, insurance policies and utility bills/)).toBeInTheDocument();
    expect(screen.getByText(/Lease templates you upload/)).toBeInTheDocument();
    expect(screen.getByText(/Your tax data/)).toBeInTheDocument();
    expect(screen.getByText(/for a spam check/)).toBeInTheDocument();
  });

  it("covers tenant data and when deletion is refused", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /people you rent to/i })).toBeInTheDocument();
    expect(screen.getByText(/we\s+can't delete the account yet/)).toBeInTheDocument();
  });

  it("renders the Who we are section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /who we are/i })).toBeInTheDocument();
  });

  it("renders the What we collect section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /what we collect/i })).toBeInTheDocument();
  });

  it("renders the Why we collect it section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /why we collect/i })).toBeInTheDocument();
  });

  it("renders the Where your data is stored section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /where your data/i })).toBeInTheDocument();
  });

  it("renders the How long we keep it section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /how long/i })).toBeInTheDocument();
  });

  it("renders the Who we share your data with section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /who we share/i })).toBeInTheDocument();
  });

  it("renders the Your rights section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /your rights/i })).toBeInTheDocument();
  });

  it("renders the Security measures section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /security measures/i })).toBeInTheDocument();
  });

  it("renders the Cookies section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /cookies/i })).toBeInTheDocument();
  });

  it("renders the Children section", () => {
    renderPrivacyPolicy();
    expect(screen.getByRole("heading", { name: /children/i })).toBeInTheDocument();
  });

  it("renders the Changes section", () => {
    renderPrivacyPolicy();
    expect(screen.getAllByRole("heading", { name: /changes/i }).length).toBeGreaterThan(0);
  });

  it("does not expose a personal email anywhere on the page", () => {
    renderPrivacyPolicy();
    expect(screen.queryByText(/jasonykwon91/i)).toBeNull();
    const mailtoLinks = screen
      .queryAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("mailto:"));
    expect(mailtoLinks).toHaveLength(0);
  });
});

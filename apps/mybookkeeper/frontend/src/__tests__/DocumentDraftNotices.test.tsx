/**
 * What a reading says beyond the fields it filled in, and how loudly.
 *
 * The panel used to render every one of these as the same blue box: the
 * confidence line, a field that may be wrong, thirteen coverage limits, and a
 * 1,900-character run of the reader's own prose folded into a single list item
 * under the heading "this form has no field for them yet". Nothing was missing
 * and nothing was legible.
 *
 * Two things are pinned here. Urgency: only the confidence line and the
 * warnings — the content that decides whether the operator fixes a field before
 * saving — stay in view, and "I wasn't very sure" no longer wears the same
 * colour as "worth a look". And reach: folding the rest away is not dropping
 * it, so the summary has to say how much is behind it and opening it has to
 * produce all of it, verbatim.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import type { DraftNoticeSource } from "@/app/features/documents/DocumentDraftNotices";

/** Verbatim from the operator's 2026 Peerless renewal, trimmed to three paragraphs. */
const REAL_NOTES = `Carrier is Certain Underwriters at Lloyd's of London; coverholder is Wilson Smith Group LLC. Mortgagee: Texas Dow Employees Credit Union, Loan# 240225216.

Premium breakdown from dec page: Premium $2,591.00 (annual term). Fees and taxes itemised: Inspection Fee $65.00, Policy Fee $160.00, Agent Policy Fee $30.00, Surplus Lines Tax $138.03, Stamping Fee $1.14. Total fees and taxes = $394.17. Arithmetic check: $2,591.00 + $394.17 = $2,985.17 — confirmed.

Co-insurance clause applies at 90%. Policy is surplus lines; 25% minimum earned premium applies.`;

function source(overrides: Partial<DraftNoticeSource> = {}): DraftNoticeSource {
  return { confidence: "high", warnings: [], unrepresented: [], ...overrides };
}

function renderNotices(
  draft: DraftNoticeSource,
  notes: string | null = null,
) {
  return render(
    <DocumentDraftNotices draft={draft} notes={notes} testIdPrefix="policy" />,
  );
}

function reference() {
  return screen.getByTestId("policy-draft-reference");
}

describe("DocumentDraftNotices — how sure the reading was", () => {
  it("congratulates a clean read", () => {
    renderNotices(source({ confidence: "high" }));

    expect(screen.getByText("I read these straight off the document.")).toBeVisible();
  });

  it("sounds a warning when it wasn't sure, not a note", () => {
    // "Please check every field" and "worth a look" rendered in the same blue
    // until now, which left the operator to work out which one was asking for
    // something. Orange is the panel's word for "this needs you".
    const { container } = renderNotices(source({ confidence: "low" }));

    const box = screen.getByText(/Please check every field/);
    expect(box).toBeVisible();
    expect(container.querySelector(".bg-orange-50")).not.toBeNull();
  });

  it("keeps a partly-interpreted read below that", () => {
    const { container } = renderNotices(source({ confidence: "medium" }));

    expect(screen.getByText(/worth a look before you save/)).toBeVisible();
    expect(container.querySelector(".bg-orange-50")).toBeNull();
  });

  it("treats an unrecognised confidence as the least sure", () => {
    renderNotices(source({ confidence: "banana" }));

    expect(screen.getByText(/Please check every field/)).toBeVisible();
  });
});

describe("DocumentDraftNotices — what stays in view", () => {
  it("shows every warning without folding it away", () => {
    renderNotices(
      source({
        warnings: [
          "I couldn't tell how often the premium is billed.",
          "The fees didn't add up to the stated total.",
        ],
      }),
    );

    expect(screen.getByText(/how often the premium is billed/)).toBeVisible();
    expect(screen.getByText(/didn't add up to the stated total/)).toBeVisible();
    expect(screen.queryByTestId("policy-draft-reference")).not.toBeInTheDocument();
  });

  it("renders nothing beyond the confidence line when the read was complete", () => {
    renderNotices(source());

    expect(screen.queryByTestId("policy-draft-reference")).not.toBeInTheDocument();
  });
});

describe("DocumentDraftNotices — the folded reference section", () => {
  it("counts the terms it is holding so folding them away isn't silence", () => {
    renderNotices(source({ unrepresented: ["liability $300,000", "medical $5,000"] }));

    expect(reference()).toHaveTextContent("I noticed 2 more terms on the document.");
  });

  it("says term, singular, when there is one", () => {
    renderNotices(source({ unrepresented: ["liability $300,000"] }));

    expect(reference()).toHaveTextContent("I noticed 1 more term on the document.");
  });

  it("mentions the notes alongside the count when both are there", () => {
    renderNotices(source({ unrepresented: ["liability $300,000"] }), REAL_NOTES);

    expect(reference()).toHaveTextContent(
      "I noticed 1 more term on the document, plus some notes I jotted down.",
    );
  });

  it("opens for notes alone, with no count to give", () => {
    renderNotices(source(), REAL_NOTES);

    expect(reference()).toHaveTextContent(
      "I also jotted down some notes about this document.",
    );
  });

  it("stays folded until the operator asks", () => {
    // Folded, not truncated — the content below is rendered in full, and the
    // browser reveals it on click. Nothing here is a summary of itself.
    renderNotices(source({ unrepresented: ["liability $300,000"] }), REAL_NOTES);

    expect(reference()).not.toHaveAttribute("open");
  });

  it("lists every term it counted", () => {
    const terms = [
      "Premises Liability (Coverage L) limit $300,000",
      "Medical Payments (Coverage M) limit $5,000",
      "Co-insurance clause at 90% of replacement cost value",
    ];
    renderNotices(source({ unrepresented: terms }));

    const items = within(reference()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(terms);
  });
});

describe("DocumentDraftNotices — the reader's own notes", () => {
  it("keeps the reader's paragraphs as paragraphs", () => {
    // The whole point of the change. As one list item, the fee itemisation that
    // proves the premium math sat mid-sentence in a 1,900-character block.
    renderNotices(source(), REAL_NOTES);

    const paragraphs = within(reference())
      .getAllByText(/./, { selector: "p" })
      .map((node) => node.textContent);

    expect(paragraphs).toContain("My notes on this document:");
    expect(paragraphs.some((text) => text?.startsWith("Carrier is Certain"))).toBe(true);
    expect(paragraphs.some((text) => text?.startsWith("Premium breakdown"))).toBe(true);
    expect(paragraphs.some((text) => text?.startsWith("Co-insurance clause"))).toBe(true);
  });

  it("keeps the arithmetic that reconciles premium against total", () => {
    renderNotices(source(), REAL_NOTES);

    expect(reference()).toHaveTextContent(
      "Arithmetic check: $2,591.00 + $394.17 = $2,985.17 — confirmed.",
    );
  });

  it("says nothing at all about notes that are only whitespace", () => {
    renderNotices(source(), "   \n\n   ");

    expect(screen.queryByTestId("policy-draft-reference")).not.toBeInTheDocument();
  });

  it("holds a single-paragraph note without splitting it", () => {
    renderNotices(source(), "Rate assumes autopay enrollment.");

    expect(reference()).toHaveTextContent("Rate assumes autopay enrollment.");
  });
});

describe("DocumentDraftNotices — no longer apologising", () => {
  it("does not promise a field that is never coming", () => {
    // Notes is deliberately never auto-filled: the operator writes their own
    // record there. "No field for them yet" promised the opposite.
    renderNotices(source({ unrepresented: ["liability $300,000"] }), REAL_NOTES);

    expect(screen.queryByText(/no field for them yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/don't fit anywhere/)).not.toBeInTheDocument();
  });
});

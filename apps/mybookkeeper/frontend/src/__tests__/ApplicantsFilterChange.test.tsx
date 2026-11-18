/**
 * Against the real RTK Query hooks: a stage filter never shows the previous stage's applicants,
 * neither while it loads nor after it failed, but a failed "Load more" keeps the rows already shown.
 * That holds when the filter changes outside the page's own chips too (a link to the same page).
 */
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router-dom";
import Applicants from "@/app/pages/Applicants";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import { APPLICANT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/applicantLabels";
import { restoreApi, stubApi } from "@/test/api-stub";
import { deferred } from "@/test/deferred";
import { answerListPage } from "@/test/paged-list-server";
import { renderWithStore } from "@/test/render-with-store";

function anApplicant(n: number): ApplicantSummary {
  return {
    id: `app-${n}`,
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: `Lead Applicant ${n}`,
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lead",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-04-25T10:00:00Z",
  };
}

const LEADS = { items: [anApplicant(1)], total: 1, has_more: false };
const ERROR_MESSAGE = /I couldn't load your applicants/i;
const LOAD_MORE_ERROR_MESSAGE = /I couldn't load more applicants/i;

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("Applicants after a filter change", () => {
  it("shows the skeleton while the new stage loads, then the error with none of the previous stage's rows", async () => {
    const approved = deferred<unknown>();
    stubApi((path, params) => (path === "/applicants" && params.stage === "approved" ? approved.promise : LEADS));
    cleanup = renderWithStore(<Applicants />, "/applicants");
    expect((await screen.findAllByText("Lead Applicant 1")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByTestId("applicant-filter-approved"));

    expect(await screen.findByTestId("applicants-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Lead Applicant 1")).not.toBeInTheDocument();

    approved.reject(new Error("server down"));

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Lead Applicant 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applicants-skeleton")).not.toBeInTheDocument();
  });

  it("keeps the rows already shown when 'Load more' fails", async () => {
    const rows = Array.from({ length: APPLICANT_PAGE_SIZE + 1 }, (_, i) => anApplicant(i + 1));
    stubApi((_path, params) => {
      if (Number(params.offset) > 0) throw new Error("server down");
      return answerListPage(rows, params);
    });
    cleanup = renderWithStore(<Applicants />, "/applicants");
    expect((await screen.findAllByText("Lead Applicant 1")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]);

    expect(await screen.findByText(LOAD_MORE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByText("Lead Applicant 1").length).toBeGreaterThan(0);
  });

  it("drops the loaded pages when a link changes the stage after 'Load more'", async () => {
    const leads = Array.from({ length: APPLICANT_PAGE_SIZE * 3 }, (_, i) => anApplicant(i + 1));
    const approved = deferred<unknown>();
    const approvedOffsets: unknown[] = [];
    stubApi((_path, params) => {
      if (params.stage === "approved") {
        approvedOffsets.push(params.offset);
        return approved.promise;
      }
      return answerListPage(leads, params);
    });
    cleanup = renderWithStore(
      <>
        <Link to="/applicants?stage=approved">Approved applicants</Link>
        <Applicants />
      </>,
      "/applicants",
    );
    expect((await screen.findAllByText("Lead Applicant 1")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]);
    expect((await screen.findAllByText(`Lead Applicant ${APPLICANT_PAGE_SIZE + 1}`)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("link", { name: "Approved applicants" }));

    expect(await screen.findByTestId("applicants-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Lead Applicant 1")).not.toBeInTheDocument();
    expect(approvedOffsets).toEqual([0]);

    approved.reject(new Error("server down"));

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Lead Applicant 1")).not.toBeInTheDocument();
  });
});

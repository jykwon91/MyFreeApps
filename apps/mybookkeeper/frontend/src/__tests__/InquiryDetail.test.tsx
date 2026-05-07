import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { store } from "@/shared/store";
import InquiryDetail from "@/app/pages/InquiryDetail";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";

const mockInquiry: InquiryResponse = {
  id: "inq-1",
  organization_id: "org-1",
  user_id: "user-1",
  listing_id: "listing-1",
  source: "FF",
  external_inquiry_id: "I-12345",
  inquirer_name: "Alice Nguyen",
  inquirer_email: "alice@example.com",
  inquirer_phone: "+15551234567",
  inquirer_employer: "Texas Children's Hospital",
  desired_start_date: "2026-06-01",
  desired_end_date: "2026-08-31",
  stage: "new",
  gut_rating: null,
  notes: "Sounds promising — short pet on premises mention.",
  received_at: "2026-04-25T10:00:00Z",
  email_message_id: null,
  linked_applicant_id: null,
  // T0 — public inquiry form fields default to safe pre-T0 values
  submitted_via: "manual_entry",
  spam_status: "unscored",
  spam_score: null,
  move_in_date: null,
  move_out_date: null,
  occupant_count: null,
  has_pets: null,
  pets_description: null,
  vehicle_count: null,
  current_city: null,
  employment_status: null,
  why_this_room: null,
  additional_notes: null,
  messages: [
    {
      id: "msg-1",
      inquiry_id: "inq-1",
      direction: "inbound",
      channel: "email",
      from_address: "alice@example.com",
      to_address: "host@example.com",
      subject: "Inquiry about your listing",
      raw_email_body: "Hello, I'd love to rent for 3 months starting June 1.",
      parsed_body: "Hello, I'd love to rent for 3 months starting June 1.",
      email_message_id: "<msg-1@gmail>",
      sent_at: "2026-04-25T10:00:00Z",
      created_at: "2026-04-25T10:00:00Z",
    },
  ],
  events: [
    {
      id: "evt-1",
      inquiry_id: "inq-1",
      event_type: "received",
      actor: "system",
      notes: null,
      occurred_at: "2026-04-25T10:00:00Z",
      created_at: "2026-04-25T10:00:00Z",
    },
  ],
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const updateMutation = vi.fn(() => ({ unwrap: () => Promise.resolve(mockInquiry) }));
const deleteMutation = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

interface DetailQueryState {
  data: InquiryResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

const defaultDetailState: DetailQueryState = {
  data: mockInquiry,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/shared/store/inquiriesApi", () => ({
  useGetInquiryByIdQuery: vi.fn(() => defaultDetailState),
  useGetInquiriesQuery: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() })),
  useUpdateInquiryMutation: vi.fn(() => [updateMutation, { isLoading: false }]),
  useDeleteInquiryMutation: vi.fn(() => [deleteMutation, { isLoading: false }]),
  useCreateInquiryMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetReplyTemplatesQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useLazyRenderReplyTemplateQuery: vi.fn(() => [
    vi.fn(),
    { data: undefined, isFetching: false },
  ]),
  useSendInquiryReplyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  // T0 — public inquiry form spam triage hooks
  useGetInquirySpamAssessmentsQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useMarkInquiryNotSpamMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useMarkInquirySpamMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/integrationsApi", () => ({
  useGetIntegrationsQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

import { useGetInquiryByIdQuery } from "@/shared/store/inquiriesApi";

type DetailQueryReturn = ReturnType<typeof useGetInquiryByIdQuery>;

function renderDetail() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/inquiries/${mockInquiry.id}`]}>
        <Routes>
          <Route path="/inquiries/:inquiryId" element={<InquiryDetail />} />
          <Route path="/inquiries" element={<div>Inbox</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("InquiryDetail page", () => {
  beforeEach(() => {
    vi.mocked(useGetInquiryByIdQuery).mockReturnValue(
      defaultDetailState as unknown as DetailQueryReturn,
    );
    updateMutation.mockClear();
    deleteMutation.mockClear();
  });

  it("renders all sections with the inquiry payload", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Alice Nguyen" })).toBeInTheDocument();
    expect(screen.getByText("Texas Children's Hospital")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("+15551234567")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-stage-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-decline-button")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-archive-button")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-message-thread")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-event-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-quality-breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("notes-section")).toBeInTheDocument();
  });

  it("renders the loading skeleton while fetching", () => {
    vi.mocked(useGetInquiryByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: undefined,
      isLoading: true,
    } as unknown as DetailQueryReturn);
    renderDetail();
    expect(screen.getByTestId("inquiry-detail-skeleton")).toBeInTheDocument();
  });

  it("renders an error AlertBox when the query errors", () => {
    vi.mocked(useGetInquiryByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: undefined,
      isError: true,
    } as unknown as DetailQueryReturn);
    renderDetail();
    expect(screen.getByText(/I couldn't load this inquiry/i)).toBeInTheDocument();
  });

  it("calls update mutation when the stage dropdown changes", async () => {
    const user = userEvent.setup();
    renderDetail();
    const dropdown = screen.getByTestId("inquiry-stage-dropdown");
    await user.selectOptions(dropdown, "triaged");
    await waitFor(() => {
      expect(updateMutation).toHaveBeenCalledWith({
        id: "inq-1",
        data: { stage: "triaged" },
      });
    });
  });

  it("opens a confirmation dialog before declining", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByTestId("inquiry-decline-button"));
    expect(screen.getByText(/Decline this inquiry/i)).toBeInTheDocument();
  });

  it("opens a confirmation dialog before archiving", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByTestId("inquiry-archive-button"));
    expect(screen.getByText(/Archive this inquiry/i)).toBeInTheDocument();
  });

  it("renders message bodies as plaintext (no innerHTML escape hatch)", () => {
    const inquiryWithHtml: InquiryResponse = {
      ...mockInquiry,
      messages: [
        {
          ...mockInquiry.messages[0],
          parsed_body: "<script>alert('xss')</script>Plain text after.",
          raw_email_body: "<script>alert('xss')</script>Plain text after.",
        },
      ],
    };
    vi.mocked(useGetInquiryByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: inquiryWithHtml,
    } as unknown as DetailQueryReturn);
    renderDetail();
    // The literal "<script>" string appears in the DOM as text — never as a
    // <script> element. queryByText with the exact string returns the
    // textNode wrapper iff it was rendered as text.
    expect(screen.getByText(/<script>alert\('xss'\)<\/script>Plain text after\./)).toBeInTheDocument();
    // No actual script tags injected into the document.
    expect(document.querySelectorAll("script").length).toBe(0);
  });

  it("calls update mutation when notes editor blurs with a changed value", async () => {
    const user = userEvent.setup();
    renderDetail();
    const editor = screen.getByTestId("inquiry-notes-editor");
    await user.click(editor);
    await user.clear(editor);
    await user.type(editor, "Updated notes from the host.");
    await user.tab(); // blur
    await waitFor(() => {
      expect(updateMutation).toHaveBeenCalledWith({
        id: "inq-1",
        data: { notes: "Updated notes from the host." },
      });
    });
  });

  it("does NOT call update on blur when notes are unchanged", async () => {
    const user = userEvent.setup();
    renderDetail();
    const editor = screen.getByTestId("inquiry-notes-editor");
    await user.click(editor);
    await user.tab(); // blur with no change
    expect(updateMutation).not.toHaveBeenCalled();
  });

  it("renders events chronologically in the timeline (after expanding)", async () => {
    const user = userEvent.setup();
    renderDetail();
    const toggle = screen.getByRole("button", { name: /Activity timeline/i });
    await user.click(toggle);
    // Scope to the timeline so we don't match the "Received Apr 25..." subtitle.
    const timeline = screen.getByTestId("inquiry-event-timeline");
    expect(timeline).toHaveTextContent(/Received/i);
    expect(timeline).toHaveTextContent(/System/i);
  });
});

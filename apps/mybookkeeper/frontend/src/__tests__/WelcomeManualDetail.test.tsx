/**
 * Unit tests for the WelcomeManualDetail page.
 *
 * Verifies:
 *   - The "Email to guest" button is DISABLED when the manual has 0 sections
 *     and ENABLED once it has at least one section (operator decision).
 *   - The loading skeleton renders while the manual query is in-flight.
 *   - The error state offers a retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import WelcomeManualDetail from "@/app/pages/WelcomeManualDetail";
import type { WelcomeManualResponse } from "@/shared/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";

let mockManual: WelcomeManualResponse | undefined;
let mockIsLoading = false;
let mockIsError = false;

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useGetWelcomeManualByIdQuery: vi.fn(() => ({
    data: mockManual,
    isLoading: mockIsLoading,
    isFetching: false,
    isError: mockIsError,
    refetch: vi.fn(),
  })),
  useCreateSectionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteWelcomeManualMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useEnableWelcomeManualShareMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateWelcomeManualShareMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRevokeWelcomeManualShareMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useReorderSectionsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUploadSectionImagesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCreateSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCreatePlaceMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdatePlaceMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeletePlaceMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [] })),
}));

function makeSection(id: string): WelcomeManualSectionResponse {
  return {
    id,
    manual_id: "m-1",
    title: "Wi-Fi",
    body: "instructions",
    display_order: 0,
    fields: [],
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeManual(sections: WelcomeManualSectionResponse[]): WelcomeManualResponse {
  return {
    id: "m-1",
    organization_id: "org-1",
    user_id: "user-1",
    property_id: null,
    title: "Lakeview Welcome Guide",
    intro_text: null,
    sections,
    places: [],
    share_token: null,
    share_pin: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function renderDetail() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/welcome-manuals/m-1"]}>
        <Routes>
          <Route path="/welcome-manuals/:manualId" element={<WelcomeManualDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("WelcomeManualDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManual = undefined;
    mockIsLoading = false;
    mockIsError = false;
  });

  it("renders the skeleton while loading", () => {
    mockIsLoading = true;
    renderDetail();
    expect(screen.getByTestId("welcome-manual-detail-skeleton")).toBeInTheDocument();
  });

  it("shows an error + retry when the query errors", () => {
    mockIsError = true;
    renderDetail();
    expect(screen.getByText(/I couldn't load this welcome manual/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("disables the Email button when the manual has 0 sections", () => {
    mockManual = makeManual([]);
    renderDetail();
    expect(screen.getByTestId("email-welcome-manual-button")).toBeDisabled();
    // Empty-sections placeholder shows instead of section cards.
    expect(screen.getByTestId("welcome-manual-sections-empty")).toBeInTheDocument();
  });

  it("enables the Email button once the manual has at least one section", () => {
    mockManual = makeManual([makeSection("sec-1")]);
    renderDetail();
    expect(screen.getByTestId("email-welcome-manual-button")).not.toBeDisabled();
    expect(screen.getByTestId("welcome-manual-sections")).toBeInTheDocument();
  });

  it("renders a guest preview panel beside the editor", () => {
    mockManual = makeManual([makeSection("sec-1")]);
    renderDetail();
    expect(screen.getByTestId("welcome-manual-editor-column")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-preview-column")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-preview")).toBeInTheDocument();
  });

  it("toggles the mobile view between edit and preview", () => {
    mockManual = makeManual([makeSection("sec-1")]);
    renderDetail();
    const editTab = screen.getByTestId("welcome-manual-view-toggle-edit");
    const previewTab = screen.getByTestId("welcome-manual-view-toggle-preview");
    // Editor is the default selected tab.
    expect(editTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(previewTab);
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(editTab).toHaveAttribute("aria-selected", "false");
  });
});

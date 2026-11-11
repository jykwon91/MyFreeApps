/**
 * A job link or a pasted description over what the backend reads is kept in its field, explained
 * with a static message and a separate counter, and never sent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS,
  JD_TEXT_MAX_LENGTH,
  JOB_URL_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/addApplicationForm";
import AddApplicationDialog from "../AddApplicationDialog";

const extractMock = vi.fn();
const parseMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useListCompaniesQuery: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false }),
  useLazyListCompaniesQuery: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ items: [], total: 0 }) }))],
  useCreateCompanyMutation: () => [vi.fn(), { isLoading: false }],
  useTriggerCompanyResearchMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useCreateApplicationMutation: () => [vi.fn(), { isLoading: false }],
  useParseJobDescriptionMutation: () => [parseMock, { isLoading: false }],
  useExtractJdFromUrlMutation: () => [extractMock, { isLoading: false }],
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

const LONG_LINK = `https://jobs.example.com/${"a".repeat(JOB_URL_MAX_LENGTH)}`;

describe("AddApplicationDialog — input length", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says a too-long link is too long, with a counter, and doesn't read it on Auto-fill or on paste", async () => {
    const user = userEvent.setup();
    render(<AddApplicationDialog open onOpenChange={vi.fn()} />);
    const field = screen.getByLabelText(/job posting url/i);

    await user.click(field);
    await user.paste(LONG_LINK);

    expect(extractMock).not.toHaveBeenCalled();
    expect(field).toHaveValue(LONG_LINK);
    expect(screen.getByRole("alert")).toHaveTextContent(PROBLEMS.jobUrlTooLong);
    expect(screen.getByText(`${(LONG_LINK.length).toLocaleString("en-US")} / ${JOB_URL_MAX_LENGTH.toLocaleString("en-US")}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-fill/i })).toBeDisabled();

    await user.type(field, "{Enter}");
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("says a too-long job description is too long and doesn't parse it", async () => {
    const user = userEvent.setup();
    render(<AddApplicationDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByText(/no url\? paste the description text instead/i));

    const field = screen.getByLabelText(/job description text/i);
    const tooLong = "😀".repeat(JD_TEXT_MAX_LENGTH + 1);
    fireEvent.change(field, { target: { value: tooLong } });

    expect(field).toHaveValue(tooLong);
    expect(screen.getByRole("alert")).toHaveTextContent(PROBLEMS.jdTextTooLong);
    expect(screen.getByRole("button", { name: /parse with ai/i })).toBeDisabled();
    expect(parseMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PersonalTransferSenders from "@/app/features/personal-transfer/PersonalTransferSenders";
import type { PersonalTransferSender } from "@mybookkeeper/api-client/types/personal-transfer/personal-transfer-sender";

vi.mock("@mybookkeeper/api-client/store/personalTransferApi", () => ({
  useGetPersonalTransferSendersQuery: vi.fn(),
  useForgetPersonalTransferSenderMutation: vi.fn(),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { showError, showSuccess } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import {
  useForgetPersonalTransferSenderMutation,
  useGetPersonalTransferSendersQuery,
} from "@mybookkeeper/api-client/store/personalTransferApi";

let forgetTrigger: ReturnType<typeof vi.fn>;
const refetch = vi.fn();

function senders(count: number): PersonalTransferSender[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    display_name: i === 0 ? "Dao Nguyen" : `Sender ${i}`,
    payer_handle: i === 0 ? "dao@example.com" : "",
  }));
}

function setQuery(state: { data?: PersonalTransferSender[]; isLoading?: boolean; isFetching?: boolean }) {
  vi.mocked(useGetPersonalTransferSendersQuery).mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isFetching: state.isFetching ?? false,
    refetch,
  } as unknown as ReturnType<typeof useGetPersonalTransferSendersQuery>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  forgetTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));
  vi.mocked(useForgetPersonalTransferSenderMutation).mockReturnValue([
    forgetTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useForgetPersonalTransferSenderMutation>);
});

describe("PersonalTransferSenders", () => {
  it("shows a skeleton while loading", () => {
    setQuery({ isLoading: true });
    render(<PersonalTransferSenders />);
    expect(screen.getByTestId("personal-transfer-senders-skeleton")).toBeInTheDocument();
  });

  it("explains what the list is for when it's empty", () => {
    setQuery({ data: [] });
    render(<PersonalTransferSenders />);
    expect(screen.getByText(/No remembered senders/)).toBeInTheDocument();
  });

  it("offers a retry when it couldn't load", () => {
    setQuery({});
    render(<PersonalTransferSenders />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("stops skipping a sender after confirming", async () => {
    setQuery({ data: senders(2) });
    render(<PersonalTransferSenders />);
    expect(screen.getByText("dao@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop skipping Dao Nguyen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Stop skipping Dao Nguyen?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop skipping" }));
    await waitFor(() => expect(forgetTrigger).toHaveBeenCalledWith("s0"));
    expect(showSuccess).toHaveBeenCalledWith(
      "I'll stop skipping Dao Nguyen. Their next payment will show up in Payment Review.",
    );
  });

  it("says so when forgetting fails", async () => {
    forgetTrigger = vi.fn(() => ({ unwrap: () => Promise.reject(new Error("boom")) }));
    vi.mocked(useForgetPersonalTransferSenderMutation).mockReturnValue([
      forgetTrigger,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useForgetPersonalTransferSenderMutation>);
    setQuery({ data: senders(1) });
    render(<PersonalTransferSenders />);
    fireEvent.click(screen.getByRole("button", { name: "Stop skipping Dao Nguyen" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stop skipping" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("I couldn't stop skipping that sender. Want to try again?"));
  });

  it("shows the first ten, then all of them", () => {
    setQuery({ data: senders(12) });
    render(<PersonalTransferSenders />);
    expect(screen.getAllByTestId("personal-transfer-sender")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByTestId("personal-transfer-sender")).toHaveLength(12);
  });

  it("lets a viewer see the list but not change it", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    setQuery({ data: senders(1) });
    render(<PersonalTransferSenders />);
    expect(screen.getByText("Dao Nguyen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop skipping/ })).not.toBeInTheDocument();
  });
});

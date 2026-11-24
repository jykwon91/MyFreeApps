import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PlaidLinkOnSuccessMetadata, PlaidLinkOptionsWithLinkToken } from "react-plaid-link";
import { showError, showSuccess } from "@platform/ui";
import { usePlaidLinkFlow } from "@/app/features/financial-accounts/plaid/usePlaidLinkFlow";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import { PLAID_LINK_SESSION_STORAGE_KEY } from "@/shared/lib/session-storage-keys";

const open = vi.fn<(linkToken: string | null) => void>();
let linkOptions: PlaidLinkOptionsWithLinkToken | null = null;
interface FakeHandler {
  token: string | null;
  destroyed: boolean;
}
// Behaves like react-plaid-link 5: a handler per token, built in an effect and
// loaded later (onLoad); when the token goes away the old handler is destroyed
// but still returned, so `ready` stays true and its open() does nothing.
vi.mock("react-plaid-link", async () => {
  const { useEffect, useState } = await import("react");
  return {
    usePlaidLink: (options: PlaidLinkOptionsWithLinkToken) => {
      linkOptions = options;
      const [handler, setHandler] = useState<FakeHandler | null>(null);
      useEffect(() => {
        if (!options.token && !options.receivedRedirectUri) return;
        const next: FakeHandler = { token: options.token, destroyed: false };
        setHandler(next);
        const loaded = setTimeout(() => options.onLoad?.(), 0);
        return () => {
          clearTimeout(loaded);
          next.destroyed = true;
        };
      }, [options.token]); // eslint-disable-line react-hooks/exhaustive-deps
      const openHandler = () => {
        if (handler && !handler.destroyed) open(handler.token);
      };
      return { open: openHandler, ready: handler !== null, error: null, exit: vi.fn() };
    },
  };
});

const createLinkToken = vi.fn();
const markReconnected = vi.fn();
vi.mock("@mybookkeeper/api-client/store/plaidApi", () => ({
  useCreatePlaidLinkTokenMutation: () => [createLinkToken],
  useMarkPlaidItemReconnectedMutation: () => [markReconnected],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const metadata: PlaidLinkOnSuccessMetadata = {
  institution: { name: "Chase", institution_id: "ins_3" },
  accounts: [
    { id: "p1", name: "Checking", mask: "4321", type: "depository", subtype: "checking", verification_status: null, class_type: null },
  ],
  link_session_id: "s1",
};

function tokenIs(linkToken: string) {
  createLinkToken.mockReturnValue({
    unwrap: () => Promise.resolve({ link_token: linkToken, expiration: "2026-11-23T12:00:00Z" }),
  });
}

beforeEach(() => {
  open.mockReset();
  createLinkToken.mockReset();
  markReconnected.mockReset();
  linkOptions = null;
  localStorage.clear();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("usePlaidLinkFlow", () => {
  it("gets a token, keeps it for an OAuth return, and opens Link", async () => {
    tokenIs("link-1");
    const { result } = renderHook(() => usePlaidLinkFlow());

    await act(() => result.current.begin(null));

    expect(createLinkToken).toHaveBeenCalledWith({ item_id: null });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const stored: unknown = JSON.parse(localStorage.getItem(PLAID_LINK_SESSION_STORAGE_KEY) ?? "null");
    expect(stored).toEqual({ linkToken: "link-1", itemId: null });
    expect(result.current.starting).toBeUndefined();
  });

  it("opens Link again for a second bank after the first one closed", async () => {
    tokenIs("link-1");
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin(null));
    await waitFor(() => expect(open).toHaveBeenCalledWith("link-1"));

    act(() => linkOptions?.onSuccess("public-1", metadata));
    tokenIs("link-2");
    await act(() => result.current.begin(null));

    await waitFor(() => expect(open).toHaveBeenLastCalledWith("link-2"));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("opens Link again after the person closed it without connecting", async () => {
    tokenIs("link-1");
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin(null));
    await waitFor(() => expect(open).toHaveBeenCalledWith("link-1"));

    act(() => linkOptions?.onExit?.(null, { institution: null, status: null, link_session_id: "s", request_id: "r" }));
    tokenIs("link-2");
    await act(() => result.current.begin(null));

    await waitFor(() => expect(open).toHaveBeenLastCalledWith("link-2"));
  });

  it("a new bank waits for the person to say what each account is", async () => {
    tokenIs("link-1");
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin(null));
    await waitFor(() => expect(open).toHaveBeenCalled());

    act(() => linkOptions?.onSuccess("public-1", metadata));

    expect(result.current.pending).toEqual({
      publicToken: "public-1",
      institutionId: "ins_3",
      institutionName: "Chase",
      accounts: [{ id: "p1", name: "Checking", mask: "4321", type: "depository", subtype: "checking" }],
    });
    expect(localStorage.getItem(PLAID_LINK_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("a reconnect tells the server and confirms, with nothing to match", async () => {
    tokenIs("link-2");
    markReconnected.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin("item-1"));
    await waitFor(() => expect(open).toHaveBeenCalled());

    act(() => linkOptions?.onSuccess("public-2", metadata));

    expect(markReconnected).toHaveBeenCalledWith("item-1");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.reconnected));
    expect(result.current.pending).toBeNull();
  });

  it("Add investments opens update mode with the consent and confirms it", async () => {
    tokenIs("link-4");
    markReconnected.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin("item-1", { addInvestments: true }));

    expect(createLinkToken).toHaveBeenCalledWith({ item_id: "item-1", add_investments: true });
    await waitFor(() => expect(open).toHaveBeenCalled());
    const stored: unknown = JSON.parse(localStorage.getItem(PLAID_LINK_SESSION_STORAGE_KEY) ?? "null");
    expect(stored).toEqual({ linkToken: "link-4", itemId: "item-1", addInvestments: true });

    act(() => linkOptions?.onSuccess("public-4", metadata));
    expect(markReconnected).toHaveBeenCalledWith("item-1");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.investmentsAdded));
  });

  it("says when investment syncing isn't turned on for this server", async () => {
    createLinkToken.mockReturnValue({ unwrap: () => Promise.reject({ status: 503, data: {} }) });
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin("item-1", { addInvestments: true }));
    expect(showError).toHaveBeenCalledWith(MSG.investmentsNotEnabled);
    expect(open).not.toHaveBeenCalled();
  });

  it("says when bank connections are not set up on the server", async () => {
    createLinkToken.mockReturnValue({ unwrap: () => Promise.reject({ status: 503, data: {} }) });
    const { result } = renderHook(() => usePlaidLinkFlow());
    await act(() => result.current.begin(null));
    expect(showError).toHaveBeenCalledWith(MSG.notConfigured);
    expect(open).not.toHaveBeenCalled();
    expect(result.current.starting).toBeUndefined();
  });

  it("resumes a session after the bank's redirect with the address it returned", async () => {
    const onSettled = vi.fn();
    renderHook(() =>
      usePlaidLinkFlow({
        receivedRedirectUri: "https://books.example/plaid-oauth?oauth_state_id=abc",
        resume: { linkToken: "link-3", itemId: null },
        onSettled,
      }),
    );
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(linkOptions?.receivedRedirectUri).toBe("https://books.example/plaid-oauth?oauth_state_id=abc");

    act(() => linkOptions?.onExit?.(null, { institution: null, status: null, link_session_id: "s", request_id: "r" }));
    expect(onSettled).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });
});

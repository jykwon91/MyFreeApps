import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkError, PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { showError, showSuccess } from "@platform/ui";
import { useCreatePlaidLinkTokenMutation, useMarkPlaidItemReconnectedMutation } from "@mybookkeeper/api-client/store/plaidApi";
import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import { forgetPlaidLinkSession, persistPlaidLinkSession } from "@/shared/lib/plaidLinkSessionStorage";
import { toPendingConnection } from "@/shared/lib/plaidPendingConnection";
import type { PlaidLinkBeginOptions } from "@/shared/types/plaid/plaid-link-begin-options";
import type { PlaidLinkFlow } from "@/shared/types/plaid/plaid-link-flow";
import type { PlaidLinkFlowOptions } from "@/shared/types/plaid/plaid-link-flow-options";
import type { PlaidLinkSession } from "@/shared/types/plaid/plaid-link-session";

const SERVICE_UNAVAILABLE = 503;

/**
 * Plaid Link from "Connect a bank", "Reconnect" or "Add investments" to its result.
 *
 * The Link token is kept in localStorage while Link is open: an OAuth bank
 * (Chase) sends the person away and back to /plaid-oauth, which resumes the
 * same session from it. Link opens once the session's own Link has loaded; the
 * button shows loading from the click until then.
 *
 * Not on `ready`: after a Link closes, react-plaid-link keeps its destroyed
 * handler and still reports ready, so opening on ready calls a dead open() and
 * the next bank's Link never shows. `onLoad` fires only for a newly built Link.
 */
export function usePlaidLinkFlow({ receivedRedirectUri, resume = null, onSettled }: PlaidLinkFlowOptions = {}): PlaidLinkFlow {
  const [createLinkToken] = useCreatePlaidLinkTokenMutation();
  const [markReconnected] = useMarkPlaidItemReconnectedMutation();
  const [session, setSession] = useState<PlaidLinkSession | null>(resume);
  const [starting, setStarting] = useState<string | null | undefined>(resume ? resume.itemId : undefined);
  const [pending, setPending] = useState<PlaidPendingConnection | null>(null);
  // Link keeps the callbacks it was created with, so they read the session from here.
  const sessionRef = useRef(session);
  const openedToken = useRef<string | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);

  const finish = useCallback(() => {
    forgetPlaidLinkSession();
    setSession(null);
    setStarting(undefined);
  }, []);

  const onSuccess = useCallback((publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
    const itemId = sessionRef.current?.itemId ?? null;
    const addedInvestments = sessionRef.current?.addInvestments === true;
    finish();
    if (itemId !== null) {
      markReconnected(itemId).unwrap().then(
        () => showSuccess(addedInvestments ? MSG.investmentsAdded : MSG.reconnected),
        () => showError(MSG.reconnectFailed),
      ).finally(() => onSettled?.());
      return;
    }
    if (!publicToken) {
      showError(MSG.linkFailed);
      onSettled?.();
      return;
    }
    setPending(toPendingConnection(publicToken, metadata));
  }, [finish, markReconnected, onSettled]);

  const onExit = useCallback((error: PlaidLinkError | null) => {
    finish();
    if (error) showError(error.display_message ?? MSG.linkFailed);
    onSettled?.();
  }, [finish, onSettled]);

  const linkToken = session?.linkToken ?? null;
  const onLoad = useCallback(() => setLoadedToken(linkToken), [linkToken]);

  const { open } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri,
    onSuccess,
    onExit,
    onLoad,
  });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session || loadedToken !== session.linkToken || openedToken.current === session.linkToken) return;
    openedToken.current = session.linkToken;
    setStarting(undefined);
    open();
  }, [session, loadedToken, open]);

  const begin = useCallback(async (itemId: string | null, { addInvestments = false }: PlaidLinkBeginOptions = {}) => {
    setStarting(itemId);
    try {
      const request = addInvestments ? { item_id: itemId, add_investments: true } : { item_id: itemId };
      const token = await createLinkToken(request).unwrap();
      const next: PlaidLinkSession = addInvestments
        ? { linkToken: token.link_token, itemId, addInvestments: true }
        : { linkToken: token.link_token, itemId };
      persistPlaidLinkSession(next);
      setSession(next);
    } catch (err) {
      setStarting(undefined);
      if (httpStatus(err) !== SERVICE_UNAVAILABLE) showError(MSG.startFailed);
      else showError(addInvestments ? MSG.investmentsNotEnabled : MSG.notConfigured);
    }
  }, [createLinkToken]);

  const clearPending = useCallback(() => setPending(null), []);

  return { begin, starting, pending, clearPending };
}

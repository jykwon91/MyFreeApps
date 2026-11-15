import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAcceptInviteMutation } from "@mybookkeeper/api-client/store/membersApi";
import { extractErrorMessage } from "@platform/ui";
import { isAlreadyMemberError } from "@/shared/utils/invite-accept";

interface UseAcceptInviteResult {
  /** Accepts the invite unless an accept was already tried, so a sign-in that just did one isn't repeated. */
  acceptOnce: () => Promise<void>;
  /** Accepts the invite once at a time. On success (or already a member) goes to the dashboard; on failure sets `error`. */
  accept: () => Promise<void>;
  isAccepting: boolean;
  error: string | null;
}

export function useAcceptInvite(token: string | undefined): UseAcceptInviteResult {
  const navigate = useNavigate();
  const [acceptInvite] = useAcceptInviteMutation();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const attempted = useRef(false);

  const accept = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    attempted.current = true;
    setIsAccepting(true);
    try {
      await acceptInvite(token).unwrap();
      navigate("/", { replace: true });
    } catch (err) {
      if (isAlreadyMemberError(err)) {
        navigate("/", { replace: true });
      } else {
        setError(extractErrorMessage(err));
      }
    } finally {
      inFlight.current = false;
      setIsAccepting(false);
    }
  }, [token, acceptInvite, navigate]);

  const acceptOnce = useCallback(async () => {
    if (attempted.current) return;
    await accept();
  }, [accept]);

  return { accept, acceptOnce, isAccepting, error };
}

import { SIGNED_OUT_MESSAGE, SIGNED_OUT_OFFLINE_MESSAGE } from "../constants/signOutMessages";
import type { AccountMessage } from "../types/AccountMessage";
import { useSession } from "./useSession";

/** Signs this phone out and says whether the server heard about it, so a failed server logout is never silent. */
export function useSignOutThisPhone(onMessage: (message: AccountMessage) => void): () => Promise<void> {
  const { session } = useSession();

  return async function signOutThisPhone(): Promise<void> {
    const { serverReached } = await session.signOut();
    onMessage(serverReached ? SIGNED_OUT_MESSAGE : SIGNED_OUT_OFFLINE_MESSAGE);
  };
}

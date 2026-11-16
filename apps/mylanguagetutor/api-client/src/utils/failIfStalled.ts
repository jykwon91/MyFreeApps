import { CONNECTION_LOST } from "../constants/turnFailureCodes";
import { NETWORK_ERROR_STATUS } from "../constants/turnRequest";
import { TurnRequestError } from "../errors/TurnRequestError";

/**
 * Settles with ``work``, or, if it hasn't settled within ``limitMs``, calls ``onStall`` (which
 * tears the request down) and rejects with ``connection_lost``: a connection that went quiet
 * without closing (a phone moving between networks) never fails on its own.
 */
export function failIfStalled<T>(work: Promise<T>, limitMs: number, onStall: () => void): Promise<T> {
  let cancel = () => {};
  const stalled = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      // Rejected first, so the race settles as connection_lost, not as the abort ``onStall`` causes.
      reject(new TurnRequestError(NETWORK_ERROR_STATUS, CONNECTION_LOST));
      onStall();
    }, limitMs);
    cancel = () => clearTimeout(timer);
  });
  return Promise.race([work, stalled]).finally(() => cancel());
}
